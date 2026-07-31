import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Injectable()
export class CreatorService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async createChannel(userId: string, name: string, description?: string): Promise<any> {
    const existing = await this.prisma.client.creatorChannel.findFirst({
      where: { userId }
    });
    if (existing) {
      throw new BadRequestException('You already own a creator channel.');
    }
    return await this.prisma.client.creatorChannel.create({
      data: {
        userId,
        name,
        description,
      }
    });
  }

  async uploadContent(userId: string, channelId: string, title: string, description: string, mediaUrl: string, isExclusive: boolean, price: number): Promise<any> {
    const channel = await this.prisma.client.creatorChannel.findUnique({
      where: { id: channelId }
    });
    if (!channel || channel.userId !== userId) {
      throw new BadRequestException('Unauthorized. You do not own this channel.');
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

  async fetchExclusiveContent(channelId: string, userId: string): Promise<any[]> {
    const contents = await this.prisma.client.creatorContent.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' }
    });

    // Check which exclusive content the user has unlocked/bought
    const result = await Promise.all(contents.map(async (c) => {
      if (!c.isExclusive) {
        return { ...c, unlocked: true };
      }
      // Check Redis purchase record
      const boughtKey = `user:purchase:${userId}:${c.id}`;
      const hasBought = await this.redis.get(boughtKey);
      return {
        ...c,
        unlocked: hasBought === 'true',
      };
    }));

    return result;
  }

  async unlockContent(userId: string, contentId: string): Promise<void> {
    const content = await this.prisma.client.creatorContent.findUnique({
      where: { id: contentId }
    });
    if (!content) {
      throw new BadRequestException('Exclusive content item not found.');
    }
    // Set purchase registry in Redis
    await this.redis.set(`user:purchase:${userId}:${contentId}`, 'true');
  }
}
