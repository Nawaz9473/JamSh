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
exports.ReelsCronService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let ReelsCronService = class ReelsCronService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    onModuleInit() {
        console.log('[ReelsCronService] Initializing background workers...');
        this.intervalId = setInterval(() => this.runBackgroundRecommendationTasks(), 60000);
        setTimeout(() => this.runBackgroundRecommendationTasks(), 5000);
    }
    onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
    async runBackgroundRecommendationTasks() {
        console.log('[ReelsCronService] Running background calculations...');
        try {
            await this.recalculateCreatorStats();
            await this.prepopulateFeedCache();
            console.log('[ReelsCronService] Background tasks finished successfully.');
        }
        catch (e) {
            console.error('[ReelsCronService] Execution failed:', e.message);
        }
    }
    async recalculateCreatorStats() {
        console.log('[ReelsCronService] Updating creator statistics counters...');
        try {
            await this.prisma.client.$executeRawUnsafe(`
        insert into public.creator_stats (user_id, total_videos, total_views, total_likes, updated_at)
        select 
          v.user_id,
          count(v.id)::int as total_videos,
          coalesce(sum(v.view_count), 0)::bigint as total_views,
          coalesce(sum(v.like_count), 0)::bigint as total_likes,
          now()
        from public.videos v
        group by v.user_id
        on conflict (user_id) do update set
          total_videos = excluded.total_videos,
          total_views = excluded.total_views,
          total_likes = excluded.total_likes,
          updated_at = now();
      `);
        }
        catch (err) {
            console.warn('[ReelsCronService] Creator stats update skip/fail (migration may not be applied yet):', err.message);
        }
    }
    async prepopulateFeedCache() {
        console.log('[ReelsCronService] Pre-populating user recommendation cache...');
        try {
            const users = await this.prisma.client.userProfile.findMany({
                take: 50,
                orderBy: { updatedAt: 'desc' }
            });
            for (const user of users) {
                const result = await this.prisma.client.$queryRawUnsafe(`
          select video_record from public.generate_reels_feed_scored(
            '${user.id}'::uuid,
            20::int,
            null::timestamp with time zone,
            null::uuid
          );
        `);
                if (result && result.length > 0) {
                    const videoIds = result.map((row) => row.video_record.id);
                    const formattedIds = videoIds.map((id) => `'${id}'::uuid`).join(',');
                    if (formattedIds) {
                        await this.prisma.client.$executeRawUnsafe(`
              insert into public.feed_cache (user_id, cached_video_ids, generated_at)
              values ('${user.id}'::uuid, array[${formattedIds}], now())
              on conflict (user_id) do update set
                cached_video_ids = excluded.cached_video_ids,
                generated_at = now();
            `);
                    }
                }
            }
        }
        catch (err) {
            console.warn('[ReelsCronService] Feed cache update skip/fail:', err.message);
        }
    }
};
exports.ReelsCronService = ReelsCronService;
exports.ReelsCronService = ReelsCronService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReelsCronService);
//# sourceMappingURL=reels-cron.service.js.map