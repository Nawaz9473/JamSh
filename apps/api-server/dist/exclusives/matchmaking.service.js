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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis.service");
const prisma_service_1 = require("../prisma.service");
let MatchmakingService = class MatchmakingService {
    constructor(redis, prisma) {
        this.redis = redis;
        this.prisma = prisma;
    }
    async joinQueue(userId, gender, filter) {
        const queueKey = `match:queue:${gender}:${filter}`;
        const inverseQueueKey = `match:queue:${filter}:${gender}`;
        const peerId = await this.redis.popFromList(inverseQueueKey);
        if (peerId) {
            const room = await this.prisma.client.chatRoom.create({
                data: { type: 'direct', name: 'Random Match' }
            });
            await this.prisma.client.chatMember.createMany({
                data: [
                    { roomId: room.id, userId: userId, role: 'member' },
                    { roomId: room.id, userId: peerId, role: 'member' }
                ]
            });
            const peerProfile = await this.prisma.client.userProfile.findUnique({
                where: { id: peerId }
            });
            await this.redis.set(`match:outcome:${peerId}`, JSON.stringify({ matched: true, roomId: room.id, peerId: userId }));
            await this.redis.set(`match:outcome:${userId}`, JSON.stringify({ matched: true, roomId: room.id, peerId: peerId }));
            return {
                matched: true,
                roomId: room.id,
                peer: peerProfile,
            };
        }
        await this.redis.pushToList(queueKey, userId);
        await this.redis.set(`match:outcome:${userId}`, JSON.stringify({ matched: false, searching: true }));
        return {
            matched: false,
            searching: true,
            message: 'Searching for matchmaking partners...'
        };
    }
    async checkMatchStatus(userId) {
        const outcomeStr = await this.redis.get(`match:outcome:${userId}`);
        if (!outcomeStr) {
            return { matched: false, searching: false };
        }
        const outcome = JSON.parse(outcomeStr);
        if (outcome.matched) {
            const peerProfile = await this.prisma.client.userProfile.findUnique({
                where: { id: outcome.peerId }
            });
            await this.redis.del(`match:outcome:${userId}`);
            return {
                matched: true,
                roomId: outcome.roomId,
                peer: peerProfile,
            };
        }
        return outcome;
    }
    async leaveQueue(userId, gender, filter) {
        const queueKey = `match:queue:${gender}:${filter}`;
        const current = await this.redis.getList(queueKey);
        const filtered = current.filter(uid => uid !== userId);
        await this.redis.del(queueKey);
        for (const uid of filtered) {
            await this.redis.pushToList(queueKey, uid);
        }
        await this.redis.del(`match:outcome:${userId}`);
    }
};
exports.MatchmakingService = MatchmakingService;
exports.MatchmakingService = MatchmakingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        prisma_service_1.PrismaService])
], MatchmakingService);
//# sourceMappingURL=matchmaking.service.js.map