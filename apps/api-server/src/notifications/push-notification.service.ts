import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger('PushNotificationService');

  async sendPush(
    userId: string,
    title: string,
    body: string,
    metadata: any = {},
  ): Promise<{ success: boolean; messageId: string }> {
    const messageId = `mock_push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(
      `[MOCK PUSH NOTIFICATION SENT]
       To User: ${userId}
       Message ID: ${messageId}
       Title: ${title}
       Body: ${body}
       Metadata: ${JSON.stringify(metadata, null, 2)}`
    );

    return { success: true, messageId };
  }
}
