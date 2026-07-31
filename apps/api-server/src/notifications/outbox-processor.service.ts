import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsQueueService } from './notifications-queue.service';

@Injectable()
export class OutboxProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxProcessorService');
  private pollingInterval: any = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: NotificationsQueueService,
  ) {}

  onModuleInit() {
    // Start background processing interval (every 1.5 seconds)
    this.pollingInterval = setInterval(() => this.processOutbox(), 1500);
    this.logger.log('Outbox Processor service initialized');
  }

  onModuleDestroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  /**
   * Main polling handler for Outbox entries
   */
  async processOutbox() {
    if (this.isProcessing) return; // Prevent overlapping runs
    this.isProcessing = true;

    try {
      // Fetch unprocessed events
      const entries = await this.prisma.client.outbox.findMany({
        where: { processedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 20, // Process in batches
      });

      if (entries.length > 0) {
        this.logger.debug(`Found ${entries.length} unprocessed outbox events.`);
      }

      for (const entry of entries) {
        try {
          const payload = entry.payload as any;

          if (entry.aggregate === 'Notification') {
            // Push notification details to delivery queue worker
            await this.queueService.addJob({
              notificationId: payload.notificationId,
              receiverId: payload.receiverId,
              type: payload.type,
              priority: payload.priority,
              metadata: payload.metadata,
            });
          }

          // Mark outbox entry as processed in db
          await this.prisma.client.outbox.update({
            where: { id: entry.id },
            data: { processedAt: new Date() },
          });
        } catch (err: any) {
          this.logger.error(`Failed to process outbox event ${entry.id}: ${err.message}`);
        }
      }
    } catch (e: any) {
      this.logger.error(`Error querying outbox table: ${e.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
