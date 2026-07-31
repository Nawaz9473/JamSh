import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
export declare class ReelsCronService implements OnModuleInit, OnModuleDestroy {
    private prisma;
    private intervalId?;
    constructor(prisma: PrismaService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    runBackgroundRecommendationTasks(): Promise<void>;
    private recalculateCreatorStats;
    private prepopulateFeedCache;
}
