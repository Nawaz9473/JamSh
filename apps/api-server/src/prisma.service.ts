import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@jamsh/db';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Attempt database connection
    try {
      await prisma.$connect();
      console.log('PostgreSQL database successfully connected via Prisma');
    } catch (e) {
      console.error('Database connection failed', e);
    }
  }

  async onModuleDestroy() {
    await prisma.$disconnect();
  }

  get client() {
    return prisma;
  }
}
