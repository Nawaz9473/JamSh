import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { NotificationType, NotificationPriority, NotificationStatus } from '@jamsh/db';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaMock: any;
  let redisMock: any;

  beforeEach(async () => {
    prismaMock = {
      client: {
        notification: {
          findFirst: jest.fn() as any,
          findMany: jest.fn(() => Promise.resolve([])) as any,
          create: jest.fn() as any,
          update: jest.fn() as any,
          updateMany: jest.fn() as any,
          deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) as any,
        },
        userProfile: {
          findUnique: jest.fn(() => Promise.resolve({ username: 'test_user' })) as any,
        },
        outbox: {
          create: jest.fn() as any,
        },
        notificationPreferences: {
          findUnique: jest.fn() as any,
          create: jest.fn() as any,
          upsert: jest.fn() as any,
        },
        followRelation: {
          count: jest.fn(() => Promise.resolve(0)) as any,
        },
        $transaction: jest.fn((cb: any) => cb(prismaMock.client)) as any,
      },
    } as any;

    redisMock = {
      get: jest.fn(() => Promise.resolve(null)) as any,
      set: jest.fn(() => Promise.resolve(undefined)) as any,
      del: jest.fn(() => Promise.resolve(undefined)) as any,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deriveGroupKey', () => {
    it('should combine type, entityId, and receiverId correctly', () => {
      const key = service.deriveGroupKey(NotificationType.LIKE, 'post_123', 'user_456');
      expect(key).toBe('LIKE_post_123_user_456');
    });
  });

  describe('isInQuietHours', () => {
    it('should return false if no quiet hours configured', async () => {
      prismaMock.client.notificationPreferences.findUnique.mockResolvedValue({
        quietHoursStart: null,
        quietHoursEnd: null,
      });

      const inQuietHours = await service.isInQuietHours('user_123');
      expect(inQuietHours).toBe(false);
    });

    it('should parse overnight quiet hours correctly', async () => {
      prismaMock.client.notificationPreferences.findUnique.mockResolvedValue({
        quietHoursStart: '23:00',
        quietHoursEnd: '08:00',
      });

      // Override global date temporarily to mock time
      const mockDate = new Date();
      mockDate.setHours(23, 30); // 23:30 is during quiet hours
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const inQuietHours = await service.isInQuietHours('user_123');
      expect(inQuietHours).toBe(true);

      // Restore Date spy
      jest.restoreAllMocks();
    });
  });

  describe('runScheduledCleanup', () => {
    it('should execute delete queries and return count', async () => {
      prismaMock.client.notification.deleteMany
        .mockResolvedValueOnce({ count: 5 })  // Standard cleanup
        .mockResolvedValueOnce({ count: 2 }); // Security cleanup

      const result = await service.runScheduledCleanup();
      expect(result.deletedCount).toBe(7);
      expect(prismaMock.client.notification.deleteMany).toHaveBeenCalledTimes(2);
    });
  });
});
