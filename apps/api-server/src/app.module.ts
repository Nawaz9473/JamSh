import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { FeedController } from './feed/feed.controller';
import { FeedService } from './feed/feed.service';
import { MatchmakingController } from './exclusives/matchmaking.controller';
import { MatchmakingService } from './exclusives/matchmaking.service';
import { CreatorController } from './creator/creator.controller';
import { CreatorService } from './creator/creator.service';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { ReelsCronService } from './feed/reels-cron.service';
import { ExploreModule } from './explore/explore.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'jamsh_jwt_super_secret_key_12345',
      signOptions: { expiresIn: '7d' },
    }),
    ExploreModule,
    NotificationsModule,
  ],
  controllers: [
    AuthController,
    FeedController,
    MatchmakingController,
    CreatorController,
    AdminController,
  ],
  providers: [
    PrismaService,
    RedisService,
    AuthService,
    FeedService,
    MatchmakingService,
    CreatorService,
    AdminService,
    ReelsCronService,
  ],
})
export class AppModule {}
