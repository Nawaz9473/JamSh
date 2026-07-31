import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReelsCronService implements OnModuleInit, OnModuleDestroy {
  private intervalId?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    console.log('[ReelsCronService] Initializing background workers...');
    // Run cron job every 60 seconds for active local testing (production would be hourly/daily)
    this.intervalId = setInterval(() => this.runBackgroundRecommendationTasks(), 60000) as any;
    
    // Execute immediately on startup
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
      // 1. Recalculate Creator statistics
      await this.recalculateCreatorStats();

      // 2. Pre-populate recommendation feeds for active users
      await this.prepopulateFeedCache();

      console.log('[ReelsCronService] Background tasks finished successfully.');
    } catch (e: any) {
      console.error('[ReelsCronService] Execution failed:', e.message);
    }
  }

  private async recalculateCreatorStats() {
    console.log('[ReelsCronService] Updating creator statistics counters...');
    try {
      // Direct raw query updates since prisma tables might not have the new videos mapping in schema.prisma yet
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
    } catch (err: any) {
      console.warn('[ReelsCronService] Creator stats update skip/fail (migration may not be applied yet):', err.message);
    }
  }

  private async prepopulateFeedCache() {
    console.log('[ReelsCronService] Pre-populating user recommendation cache...');
    try {
      // Query profiles/active users
      const users = await this.prisma.client.userProfile.findMany({
        take: 50, // limit to 50 active users for cache prepopulation
        orderBy: { updatedAt: 'desc' }
      });

      for (const user of users) {
        // Execute generate_reels_feed_scored for the user and cache the output video IDs
        const result: any[] = await this.prisma.client.$queryRawUnsafe(`
          select video_record from public.generate_reels_feed_scored(
            '${user.id}'::uuid,
            20::int,
            null::timestamp with time zone,
            null::uuid
          );
        `);

        if (result && result.length > 0) {
          const videoIds = result.map((row: any) => row.video_record.id);
          const formattedIds = videoIds.map((id: string) => `'${id}'::uuid`).join(',');
          
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
    } catch (err: any) {
      console.warn('[ReelsCronService] Feed cache update skip/fail:', err.message);
    }
  }
}
