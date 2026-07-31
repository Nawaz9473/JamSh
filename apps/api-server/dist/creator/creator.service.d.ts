import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
export declare class CreatorService {
    private prisma;
    private redis;
    constructor(prisma: PrismaService, redis: RedisService);
    createChannel(userId: string, name: string, description?: string): Promise<any>;
    uploadContent(userId: string, channelId: string, title: string, description: string, mediaUrl: string, isExclusive: boolean, price: number): Promise<any>;
    fetchExclusiveContent(channelId: string, userId: string): Promise<any[]>;
    unlockContent(userId: string, contentId: string): Promise<void>;
}
