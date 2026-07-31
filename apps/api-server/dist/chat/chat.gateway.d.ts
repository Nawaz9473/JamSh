import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis.service';
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private redis;
    server: Server;
    private activeSockets;
    constructor(redis: RedisService);
    handleConnection(socket: Socket): Promise<void>;
    handleDisconnect(socket: Socket): Promise<void>;
    handleMessage(socket: Socket, body: any): void;
    handleTyping(body: any): void;
    handleCallDial(socket: Socket, body: any): void;
    handleCallSdpOffer(body: any): void;
    handleCallSdpAnswer(body: any): void;
    handleCallIceCandidate(body: any): void;
    handleCallHangup(body: any): void;
}
