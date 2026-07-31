"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis.service");
let ChatGateway = class ChatGateway {
    constructor(redis) {
        this.redis = redis;
        this.activeSockets = new Map();
    }
    async handleConnection(socket) {
        const userId = socket.handshake.query.userId;
        if (userId) {
            this.activeSockets.set(userId, socket.id);
            await this.redis.set(`user:status:${userId}`, 'online');
            socket.broadcast.emit('user_status', { userId, status: 'online' });
            console.log(`[JAMSH SOCKETS] User ${userId} connected on socket ${socket.id}`);
        }
    }
    async handleDisconnect(socket) {
        let disconnectedUserId = null;
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
    handleMessage(socket, body) {
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
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('receive_message', messagePayload);
            socket.emit('message_delivered', { messageId: messagePayload.id, roomId });
        }
    }
    handleTyping(body) {
        const { roomId, recipientId, isTyping } = body;
        const recipientSocketId = this.activeSockets.get(recipientId);
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('typing_status', { roomId, isTyping });
        }
    }
    handleCallDial(socket, body) {
        const { recipientId, senderId, type } = body;
        const recipientSocketId = this.activeSockets.get(recipientId);
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('call_incoming', { senderId, type });
        }
        else {
            socket.emit('call_failed', { reason: 'Peer is currently offline.' });
        }
    }
    handleCallSdpOffer(body) {
        const { recipientId, sdp } = body;
        const recipientSocketId = this.activeSockets.get(recipientId);
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('call_sdp_offer_received', { sdp });
        }
    }
    handleCallSdpAnswer(body) {
        const { recipientId, sdp } = body;
        const recipientSocketId = this.activeSockets.get(recipientId);
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('call_sdp_answer_received', { sdp });
        }
    }
    handleCallIceCandidate(body) {
        const { recipientId, candidate } = body;
        const recipientSocketId = this.activeSockets.get(recipientId);
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('call_ice_candidate_received', { candidate });
        }
    }
    handleCallHangup(body) {
        const { recipientId } = body;
        const recipientSocketId = this.activeSockets.get(recipientId);
        if (recipientSocketId) {
            this.server.to(recipientSocketId).emit('call_ended');
        }
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('send_message'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('typing'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call_dial'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleCallDial", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call_sdp_offer'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleCallSdpOffer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call_sdp_answer'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleCallSdpAnswer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call_ice_candidate'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleCallIceCandidate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call_hangup'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleCallHangup", null);
exports.ChatGateway = ChatGateway = __decorate([
    (0, common_1.Injectable)(),
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map