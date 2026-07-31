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
exports.CreatorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const redis_service_1 = require("../redis.service");
let CreatorService = class CreatorService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async createChannel(userId, name, description) {
        const existing = await this.prisma.client.creatorChannel.findFirst({
            where: { userId }
        });
        if (existing) {
            throw new common_1.BadRequestException('You already own a creator channel.');
        }
        return await this.prisma.client.creatorChannel.create({
            data: {
                userId,
                name,
                description,
            }
        });
    }
    async uploadContent(userId, channelId, title, description, mediaUrl, isExclusive, price) {
        const channel = await this.prisma.client.creatorChannel.findUnique({
            where: { id: channelId }
        });
        if (!channel || channel.userId !== userId) {
            throw new common_1.BadRequestException('Unauthorized. You do not own this channel.');
        }
        return await this.prisma.client.creatorContent.create({
            data: {
                channelId,
                title,
                description,
                mediaUrl,
                isExclusive,
                price,
            }
        });
    }
    async fetchExclusiveContent(channelId, userId) {
        const contents = await this.prisma.client.creatorContent.findMany({
            where: { channelId },
            orderBy: { createdAt: 'desc' }
        });
        const result = await Promise.all(contents.map(async (c) => {
            if (!c.isExclusive) {
                return { ...c, unlocked: true };
            }
            const boughtKey = `user:purchase:${userId}:${c.id}`;
            const hasBought = await this.redis.get(boughtKey);
            return {
                ...c,
                unlocked: hasBought === 'true',
            };
        }));
        return result;
    }
    async unlockContent(userId, contentId) {
        const content = await this.prisma.client.creatorContent.findUnique({
            where: { id: contentId }
        });
        if (!content) {
            throw new common_1.BadRequestException('Exclusive content item not found.');
        }
        await this.redis.set(`user:purchase:${userId}:${contentId}`, 'true');
    }
};
exports.CreatorService = CreatorService;
exports.CreatorService = CreatorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], CreatorService);
//# sourceMappingURL=creator.service.js.map