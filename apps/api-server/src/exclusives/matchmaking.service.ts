import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MatchmakingService {
  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async joinQueue(userId: string, gender: string, filter: string): Promise<any> {
    const queueKey = `match:queue:${gender}:${filter}`;
    
    // Check if there is an active matching partner in the inverse queue:
    // e.g. if we are Male filtering for Female, we look for a Female filtering for Male!
    const inverseQueueKey = `match:queue:${filter}:${gender}`;
    const peerId = await this.redis.popFromList(inverseQueueKey);

    if (peerId) {
      // Found a match!
      // Create a direct room
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

      // Save match outcome in Redis so the waiting client can discover it when polling
      await this.redis.set(`match:outcome:${peerId}`, JSON.stringify({ matched: true, roomId: room.id, peerId: userId }));
      await this.redis.set(`match:outcome:${userId}`, JSON.stringify({ matched: true, roomId: room.id, peerId: peerId }));

      return {
        matched: true,
        roomId: room.id,
        peer: peerProfile,
      };
    }

    // No match found immediately, push our ID into the queue
    await this.redis.pushToList(queueKey, userId);
    // Mark our state as searching
    await this.redis.set(`match:outcome:${userId}`, JSON.stringify({ matched: false, searching: true }));

    return {
      matched: false,
      searching: true,
      message: 'Searching for matchmaking partners...'
    };
  }

  async checkMatchStatus(userId: string): Promise<any> {
    const outcomeStr = await this.redis.get(`match:outcome:${userId}`);
    if (!outcomeStr) {
      return { matched: false, searching: false };
    }
    const outcome = JSON.parse(outcomeStr);
    if (outcome.matched) {
      const peerProfile = await this.prisma.client.userProfile.findUnique({
        where: { id: outcome.peerId }
      });
      await this.redis.del(`match:outcome:${userId}`); // Clear state
      return {
        matched: true,
        roomId: outcome.roomId,
        peer: peerProfile,
      };
    }
    return outcome;
  }

  async leaveQueue(userId: string, gender: string, filter: string): Promise<void> {
    const queueKey = `match:queue:${gender}:${filter}`;
    // Redis pop/remove helper: filter list
    const current = await this.redis.getList(queueKey);
    const filtered = current.filter(uid => uid !== userId);
    
    // Clear and set filtered list
    await this.redis.del(queueKey);
    for (const uid of filtered) {
      await this.redis.pushToList(queueKey, uid);
    }
    await this.redis.del(`match:outcome:${userId}`);
  }
}
