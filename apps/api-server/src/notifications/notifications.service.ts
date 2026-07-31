import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { 
  NotificationType, 
  NotificationPriority, 
  NotificationStatus, 
  NotificationDeliveryStatus 
} from '@jamsh/db';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');
  private readonly GROUP_WINDOW_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Helper to derive dynamic group keys (NotificationType + EntityId + ReceiverId)
   */
  deriveGroupKey(type: NotificationType, entityId: string, receiverId: string): string {
    return `${type}_${entityId}_${receiverId}`;
  }

  /**
   * Creates a notification event using the Outbox pattern in a database transaction
   */
  async triggerNotification(
    receiverId: string,
    senderId: string,
    type: NotificationType,
    priority: NotificationPriority,
    entityId: string, // postId or commentId or roomId
    metadata: Record<string, any> = {},
  ): Promise<void> {
    if (receiverId === senderId) return; // Don't notify oneself

    const groupKey = this.deriveGroupKey(type, entityId, receiverId);

    // Run Outbox insertion and entity changes within a transaction
    await this.prisma.client.$transaction(async (tx) => {
      // Find a matching unread notification within the window for grouping
      const windowStart = new Date(Date.now() - this.GROUP_WINDOW_MINUTES * 60 * 1000);
      
      const existingNotification = await tx.notification.findFirst({
        where: {
          receiverId,
          groupKey,
          status: NotificationStatus.UNREAD,
          deletedAt: null,
          createdAt: { gte: windowStart },
        },
      });

      // Fetch actor username
      const senderProfile = await tx.userProfile.findUnique({
        where: { id: senderId },
        select: { username: true },
      });
      const senderUsername = senderProfile?.username || 'someone';

      let notificationId: string;
      let outboxEvent: string;
      let finalMetadata: any;

      if (existingNotification) {
        // Update grouping metadata
        const oldMeta = (existingNotification.metadata as Record<string, any>) || {};
        const oldActors: string[] = oldMeta.actors || [];
        
        // Add new actor username if not already present
        const updatedActors = Array.from(new Set([senderUsername, ...oldActors]));
        
        finalMetadata = {
          ...oldMeta,
          ...metadata,
          actors: updatedActors,
          count: updatedActors.length,
        };

        const updatedNotif = await tx.notification.update({
          where: { id: existingNotification.id },
          data: {
            metadata: finalMetadata,
            updatedAt: new Date(),
          },
        });

        notificationId = updatedNotif.id;
        outboxEvent = 'NotificationUpdated';
      } else {
        // Create new notification
        finalMetadata = {
          ...metadata,
          actors: [senderUsername],
          count: 1,
        };

        const newNotif = await tx.notification.create({
          data: {
            receiverId,
            senderId,
            type,
            status: NotificationStatus.UNREAD,
            priority,
            deliveryStatus: NotificationDeliveryStatus.PENDING,
            groupKey,
            metadata: finalMetadata,
          },
        });

        notificationId = newNotif.id;
        outboxEvent = 'NotificationCreated';
      }

      // Write to Outbox table
      await tx.outbox.create({
        data: {
          aggregate: 'Notification',
          aggregateId: notificationId,
          event: outboxEvent,
          payload: {
            notificationId,
            receiverId,
            type,
            priority,
            metadata: finalMetadata,
          },
        },
      });
    });

    // Invalidate Redis cache
    await this.invalidateNotificationCache(receiverId);
  }

  /**
   * Fetches preferences for a user, creating defaults if not set
   */
  async getPreferences(userId: string): Promise<any> {
    let preferences = await this.prisma.client.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.prisma.client.notificationPreferences.create({
        data: {
          userId,
          pushEnabled: true,
          emailEnabled: true,
          likesEnabled: true,
          commentsEnabled: true,
          thunderEnabled: true,
          messageEnabled: true,
          communityEnabled: true,
          recommendationEnabled: true,
          marketingEnabled: true,
        },
      });
    }
    return preferences;
  }

  /**
   * Updates preferences for a user
   */
  async updatePreferences(userId: string, data: any): Promise<any> {
    return await this.prisma.client.notificationPreferences.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }

  /**
   * Verifies if a user is currently in their configured Quiet Hours
   */
  async isInQuietHours(userId: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

    try {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [startHour, startMin] = prefs.quietHoursStart.split(':').map(Number);
      const [endHour, endMin] = prefs.quietHoursEnd.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes <= endMinutes) {
        // Standard range (e.g., 09:00 - 17:00)
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        // Overnight range (e.g., 23:00 - 08:00)
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch (e) {
      this.logger.error('Failed to parse quiet hours time format', e);
      return false;
    }
  }

  /**
   * Fetches paginated, grouped notifications for a user (with Redis caching)
   */
  async getNotifications(userId: string, page = 0, limit = 20, category?: string): Promise<any[]> {
    const cacheKey = `notifications:list:${userId}:${page}:${limit}:${category || 'ALL'}`;
    
    // Check Cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    const skip = page * limit;
    const whereClause: any = {
      receiverId: userId,
      deletedAt: null,
    };

    if (category && category !== 'All') {
      if (category === 'Likes') {
        whereClause.type = { in: [NotificationType.LIKE, NotificationType.THUNDER] };
      } else if (category === 'Comments') {
        whereClause.type = { in: [NotificationType.COMMENT, NotificationType.REPLY] };
      } else if (category === 'Follows') {
        whereClause.type = { in: [NotificationType.FOLLOW, NotificationType.FOLLOW_REQUEST, NotificationType.FOLLOW_ACCEPTED] };
      } else if (category === 'Mentions') {
        whereClause.type = { in: [NotificationType.MENTION, NotificationType.TAG] };
      } else if (category === 'AI') {
        whereClause.type = NotificationType.AI_RECOMMENDATION;
      }
    }

    const notifications = await this.prisma.client.notification.findMany({
      where: whereClause,
      take: limit,
      skip: skip,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Write to Cache
    try {
      await this.redis.set(cacheKey, JSON.stringify(notifications), 60); // 1 minute list cache
    } catch {}

    return notifications;
  }

  /**
   * Fetches separate unread count summaries (with Redis caching)
   */
  async getUnreadCounts(userId: string): Promise<any> {
    const cacheKey = `notifications:unread_counts:${userId}`;

    // Check Cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    const unreadNotifications = await this.prisma.client.notification.findMany({
      where: {
        receiverId: userId,
        status: NotificationStatus.UNREAD,
        deletedAt: null,
      },
      select: { type: true },
    });

    // Chat room unread counts can be derived from missing message read-receipts
    const chatUnreads = unreadNotifications.filter(n => n.type === NotificationType.MESSAGE).length;
    const standardUnreads = unreadNotifications.filter(n => n.type !== NotificationType.MESSAGE && n.type !== NotificationType.COMMUNITY).length;
    const communityUnreads = unreadNotifications.filter(n => n.type === NotificationType.COMMUNITY).length;

    // Follow requests count
    const followRequests = await this.prisma.client.followRelation.count({
      where: {
        followingId: userId,
        status: 'pending',
      },
    });

    const result = {
      messages: chatUnreads,
      notifications: standardUnreads,
      communities: communityUnreads,
      requests: followRequests,
    };

    // Set Cache
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 300); // 5 minutes cache
    } catch {}

    return result;
  }

  /**
   * Marks a notification as read
   */
  async markAsRead(id: string, userId: string): Promise<any> {
    const notif = await this.prisma.client.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });

    await this.invalidateNotificationCache(userId);
    return notif;
  }

  /**
   * Marks all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<any> {
    const result = await this.prisma.client.notification.updateMany({
      where: {
        receiverId: userId,
        status: NotificationStatus.UNREAD,
        deletedAt: null,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });

    await this.invalidateNotificationCache(userId);
    return result;
  }

  /**
   * Soft deletes a notification
   */
  async softDelete(id: string, userId: string): Promise<any> {
    const result = await this.prisma.client.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.invalidateNotificationCache(userId);
    return result;
  }

  /**
   * Records analytics event mapping
   */
  async trackAnalytics(notificationId: string, status: string, deviceType?: string): Promise<void> {
    await this.prisma.client.notificationAnalytics.create({
      data: {
        notificationId,
        status,
        deviceType,
      },
    });
  }

  /**
   * Helper to invalidate cache keys on mutations
   */
  private async invalidateNotificationCache(userId: string): Promise<void> {
    try {
      // Invalidate list caches (delete keys matching pattern)
      await this.redis.del(`notifications:unread_counts:${userId}`);
      
      // Invalidate standard paginated categories
      const categories = ['ALL', 'Likes', 'Comments', 'Follows', 'Mentions', 'AI'];
      for (const cat of categories) {
        for (let p = 0; p < 5; p++) {
          await this.redis.del(`notifications:list:${userId}:${p}:20:${cat}`);
        }
      }
    } catch (e) {
      this.logger.error('Failed to invalidate Redis notifications cache', e);
    }
  }

  /**
   * Scheduled cleanup task for notifications retention
   */
  async runScheduledCleanup(): Promise<{ deletedCount: number }> {
    const now = new Date();
    
    // Retention limits
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 1. Delete standard soft-deleted notifications > 30 days
    const cleanStandard = await this.prisma.client.notification.deleteMany({
      where: {
        deletedAt: { lte: thirtyDaysAgo },
        type: { not: NotificationType.SECURITY },
      },
    });

    // 2. Delete SECURITY soft-deleted notifications > 90 days
    const cleanSecurity = await this.prisma.client.notification.deleteMany({
      where: {
        deletedAt: { lte: ninetyDaysAgo },
        type: NotificationType.SECURITY,
      },
    });

    const total = cleanStandard.count + cleanSecurity.count;
    this.logger.log(`[RETENTION CLEANUP] Successfully deleted ${total} old soft-deleted notifications.`);
    return { deletedCount: total };
  }
}
