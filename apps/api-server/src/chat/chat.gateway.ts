import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Active sockets map: userId -> socketId
  private activeSockets: Map<string, string> = new Map();

  constructor(private redis: RedisService) {}

  async handleConnection(socket: Socket) {
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      this.activeSockets.set(userId, socket.id);
      await this.redis.set(`user:status:${userId}`, 'online');
      socket.broadcast.emit('user_status', { userId, status: 'online' });
      console.log(`[JAMSH SOCKETS] User ${userId} connected on socket ${socket.id}`);
    }
  }

  async handleDisconnect(socket: Socket) {
    let disconnectedUserId: string | null = null;
    for (const [uid, sid] of this.activeSockets.entries()) {
      if (sid === socket.id) {
        disconnectedUserId = uid;
        break;
      }
    }

    if (disconnectedUserId) {
      this.activeSockets.delete(disconnectedUserId);
      await this.redis.set(`user:status:${disconnectedUserId}`, 'offline');
      socket.broadcast.emit('user_status', { userId: disconnectedUserId, status: 'offline' });
      console.log(`[JAMSH SOCKETS] User ${disconnectedUserId} disconnected`);
    }
  }

  @SubscribeMessage('send_message')
  handleMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const { roomId, recipientId, senderId, content, nonce, isEncrypted, type } = body;
    const recipientSocketId = this.activeSockets.get(recipientId);

    const messagePayload = {
      id: `msg_${Date.now()}`,
      roomId,
      senderId,
      content,
      nonce,
      isEncrypted,
      type: type || 'text',
      createdAt: new Date().toISOString(),
    };

    // Relay to recipient if they are online
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('receive_message', messagePayload);
      // Send read receipt back to sender
      socket.emit('message_delivered', { messageId: messagePayload.id, roomId });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(@MessageBody() body: any) {
    const { roomId, recipientId, isTyping } = body;
    const recipientSocketId = this.activeSockets.get(recipientId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('typing_status', { roomId, isTyping });
    }
  }

  // ----------------------------------------------------
  // WebRTC Signaling Handshakes
  // ----------------------------------------------------
  @SubscribeMessage('call_dial')
  handleCallDial(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const { recipientId, senderId, type } = body; // type is voice or video
    const recipientSocketId = this.activeSockets.get(recipientId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('call_incoming', { senderId, type });
    } else {
      socket.emit('call_failed', { reason: 'Peer is currently offline.' });
    }
  }

  @SubscribeMessage('call_sdp_offer')
  handleCallSdpOffer(@MessageBody() body: any) {
    const { recipientId, sdp } = body;
    const recipientSocketId = this.activeSockets.get(recipientId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('call_sdp_offer_received', { sdp });
    }
  }

  @SubscribeMessage('call_sdp_answer')
  handleCallSdpAnswer(@MessageBody() body: any) {
    const { recipientId, sdp } = body;
    const recipientSocketId = this.activeSockets.get(recipientId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('call_sdp_answer_received', { sdp });
    }
  }

  @SubscribeMessage('call_ice_candidate')
  handleCallIceCandidate(@MessageBody() body: any) {
    const { recipientId, candidate } = body;
    const recipientSocketId = this.activeSockets.get(recipientId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('call_ice_candidate_received', { candidate });
    }
  }

  @SubscribeMessage('call_hangup')
  handleCallHangup(@MessageBody() body: any) {
    const { recipientId } = body;
    const recipientSocketId = this.activeSockets.get(recipientId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('call_ended');
    }
  }

  getActiveSocketId(userId: string): string | undefined {
    return this.activeSockets.get(userId);
  }
}
