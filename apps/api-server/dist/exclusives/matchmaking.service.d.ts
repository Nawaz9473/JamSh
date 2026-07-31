import { RedisService } from '../redis.service';
import { PrismaService } from '../prisma.service';
export declare class MatchmakingService {
    private redis;
    private prisma;
    constructor(redis: RedisService, prisma: PrismaService);
    joinQueue(userId: string, gender: string, filter: string): Promise<any>;
    checkMatchStatus(userId: string): Promise<any>;
    leaveQueue(userId: string, gender: string, filter: string): Promise<void>;
}
