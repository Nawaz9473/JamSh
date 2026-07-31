import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsQueueService } from './notifications-queue.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { ChatGateway } from '../chat/chat.gateway';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsQueueService,
    OutboxProcessorService,
    PushNotificationService,
    PrismaService,
    RedisService,
    ChatGateway,
  ],
  exports: [NotificationsService, ChatGateway],
})
export class NotificationsModule {}
