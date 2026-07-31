import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Optional real-time socket request to mark a notification as read
   */
  @SubscribeMessage('notification:read')
  async handleRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { notificationId: string; userId: string },
  ) {
    const { notificationId, userId } = body;
    if (notificationId && userId) {
      await this.notificationsService.markAsRead(notificationId, userId);
      
      // Emit acknowledgement back
      socket.emit('notification:read_receipt', { notificationId });
    }
  }

  /**
   * Optional real-time socket request to delete a notification
   */
  @SubscribeMessage('notification:delete')
  async handleDelete(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { notificationId: string; userId: string },
  ) {
    const { notificationId, userId } = body;
    if (notificationId && userId) {
      await this.notificationsService.softDelete(notificationId, userId);
      
      // Emit acknowledgement back
      socket.emit('notification:delete_receipt', { notificationId });
    }
  }
}
