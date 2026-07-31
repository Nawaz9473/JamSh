import { Module } from '@nestjs/common';
import { ExploreController } from './explore.controller';
import { ExploreService } from './explore.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ExploreController],
  providers: [ExploreService, PrismaService],
})
export class ExploreModule {}
