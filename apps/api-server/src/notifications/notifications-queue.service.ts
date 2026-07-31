import { Injectable, OnModuleInit, Inject, forwardRef, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';
import { ChatGateway } from '../chat/chat.gateway';
import { 
  NotificationType, 
  NotificationDeliveryStatus, 
  NotificationPriority 
} from '@jamsh/db';

let BullQueue: any = null;
let BullWorker: any = null;

try {
  // Dynamic import fallback support
  const bullmq = require('bullmq');
  BullQueue = bullmq.Queue;
  BullWorker = bullmq.Worker;
} catch (e) {
  // If bullmq dependency is missing
}

@Injectable()
export class NotificationsQueueService implements OnModuleInit {
  private readonly logger = new Logger('NotificationsQueueService');
  private queue: any = null;
  private worker: any = null;
  private isBullMqOnline = false;

  constructor(
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushNotificationService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async onModuleInit() {
    if (BullQueue && BullWorker && process.env.REDIS_URL) {
      try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        this.queue = new BullQueue('notifications_queue', {
          connection: { url: redisUrl },
        });

        this.worker = new BullWorker(
          'notifications_queue',
          async (job) => {
            await this.processNotificationJob(job.data);
          },
          {
            connection: { url: redisUrl },
            concurrency: 5,
          },
        );

        this.isBullMqOnline = true;
        this.logger.log('BullMQ Notifications Worker started successfully');
      } catch (err: any) {
        this.logger.warn(`BullMQ initialization failed: ${err.message}. Falling back to in-memory processing.`);
        this.isBullMqOnline = false;
      }
    } else {
      this.logger.warn('BullMQ or Redis not configured. Running on in-memory queue fallback.');
      this.isBullMqOnline = false;
    }
  }

  /**
   * Pushes a new notification delivery job to the queue
   */
  async addJob(payload: {
    notificationId: string;
    receiverId: string;
    type: NotificationType;
    priority: NotificationPriority;
    metadata: any;
  }) {
    if (this.isBullMqOnline && this.queue) {
      try {
        await this.queue.add(`deliver_${payload.notificationId}`, payload, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 }, // Retry delay
        });
        return;
      } catch (e) {
        this.logger.error('Failed to add job to BullMQ, executing in-memory', e);
      }
    }

    // In-memory fallback: process asynchronously
    setImmediate(async () => {
      try {
        await this.processNotificationJob(payload);
      } catch (err) {
        this.logger.error('[InMemoryQueue] Failed to process notification job', err);
      }
    });
  }

  /**
   * Processes a notification job: checks preferences, quiet hours, online state, and dispatches payload
   */
  private async processNotificationJob(data: {
    notificationId: string;
    receiverId: string;
    type: NotificationType;
    priority: NotificationPriority;
    metadata: any;
  }) {
    const { notificationId, receiverId, type, priority, metadata } = data;

    // 1. Verify preferences
    const prefs = await this.notificationsService.getPreferences(receiverId);
    if (!prefs.pushEnabled) {
      this.logger.log(`[Queue] User ${receiverId} disabled push notifications globally`);
      return;
    }

    // Category mapping
    let isCategoryEnabled = true;
    if (type === NotificationType.LIKE || type === NotificationType.THUNDER) {
      isCategoryEnabled = prefs.likesEnabled && prefs.thunderEnabled;
    } else if (type === NotificationType.COMMENT || type === NotificationType.REPLY) {
      isCategoryEnabled = prefs.commentsEnabled;
    } else if (type === NotificationType.MESSAGE) {
      isCategoryEnabled = prefs.messageEnabled;
    } else if (type === NotificationType.COMMUNITY) {
      isCategoryEnabled = prefs.communityEnabled;
    } else if (type === NotificationType.AI_RECOMMENDATION) {
      isCategoryEnabled = prefs.recommendationEnabled;
    }

    if (!isCategoryEnabled) {
      this.logger.log(`[Queue] User ${receiverId} disabled category type ${type}`);
      // Mark as failed/ignored
      await this.notificationsService.markAsRead(notificationId, receiverId); // clear from list or skip
      return;
    }

    // 2. Quiet Hours check (except SECURITY alerts which bypass)
    if (type !== NotificationType.SECURITY) {
      const inQuietHours = await this.notificationsService.isInQuietHours(receiverId);
      if (inQuietHours) {
        this.logger.log(`[Quiet Hours] Suppressing push for User ${receiverId} during quiet hours. Rescheduling...`);
        // In a production-grade environment, we schedule a delayed job for quiet hours end.
        // For local mock demonstration, we queue it and write to analytics
        await this.notificationsService.trackAnalytics(notificationId, 'queued_quiet_hours');
        return;
      }
    }

    // 3. Dispatch Notification
    const activeSocketId = this.chatGateway.getActiveSocketId(receiverId);
    let delivered = false;
    let methodUsed = 'push';

    if (activeSocketId) {
      // User is ONLINE: Emit WebSocket event instantly
      this.chatGateway.server.to(activeSocketId).emit('notification:new', {
        id: notificationId,
        type,
        priority,
        metadata,
        createdAt: new Date().toISOString(),
      });
      delivered = true;
      methodUsed = 'websocket';
      this.logger.log(`[Realtime] WebSocket notification delivered to online user: ${receiverId}`);
    } else {
      // User is OFFLINE: Dispatch push notification
      const pushTitle = 'JAMSH Notification';
      const actorName = metadata?.actors?.[0] || 'A user';
      const count = metadata?.count || 1;
      
      let pushBody = '';
      if (type === NotificationType.LIKE || type === NotificationType.THUNDER) {
        pushBody = count > 1 
          ? `${actorName} and ${count - 1} others thundered your post.` 
          : `${actorName} thundered your post.`;
      } else if (type === NotificationType.COMMENT) {
        pushBody = `${actorName} commented: "${metadata?.preview || '...'}"`;
      } else if (type === NotificationType.REPLY) {
        pushBody = `${actorName} replied: "${metadata?.preview || '...'}"`;
      } else if (type === NotificationType.FOLLOW) {
        pushBody = `${actorName} started following you.`;
      } else if (type === NotificationType.SECURITY) {
        pushBody = `Security Alert: ${metadata?.details || 'New device registered.'}`;
      } else {
        pushBody = `You have a new alert on JAMSH.`;
      }

      try {
        const pushResult = await this.pushService.sendPush(receiverId, pushTitle, pushBody, {
          notificationId,
          type,
          deepLink: metadata?.deepLink || '',
        });
        if (pushResult.success) {
          delivered = true;
        }
      } catch (err: any) {
        this.logger.error(`[Push] Failed to send push notification: ${err.message}`);
      }
    }

    // 4. Update Delivery Status
    if (delivered) {
      await this.notificationsService.markAsRead(notificationId, receiverId); // Update status fields safely
      // Update delivery columns directly
      // @ts-ignore
      await this.notificationsService['prisma'].client.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: NotificationDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });

      await this.notificationsService.trackAnalytics(notificationId, 'delivered', methodUsed);
    } else {
      // @ts-ignore
      await this.notificationsService['prisma'].client.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: NotificationDeliveryStatus.FAILED,
        },
      });
      await this.notificationsService.trackAnalytics(notificationId, 'failed');
    }
  }
}
