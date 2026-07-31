import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private memoryDb: Map<string, string> = new Map();
  private isOnline = false;

  async onModuleInit() {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      this.client.on('error', (err: any) => {
        console.warn('Redis client error, falling back to memory storage', err.message);
        this.isOnline = false;
      });
      await this.client.connect();
      this.isOnline = true;
      console.log('Redis cache adapter connected successfully');
    } catch (e: any) {
      console.warn('Failed to start Redis, running on in-memory storage fallback:', e.message);
      this.isOnline = false;
    }
  }

  async onModuleDestroy() {
    if (this.isOnline && this.client) {
      await this.client.disconnect();
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isOnline) {
      try {
        return await this.client.get(key);
      } catch {
        return this.memoryDb.get(key) || null;
      }
    }
    return this.memoryDb.get(key) || null;
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (this.isOnline) {
      try {
        if (expireSeconds) {
          await this.client.setEx(key, expireSeconds, value);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {}
    }
    this.memoryDb.set(key, value);
    if (expireSeconds) {
      setTimeout(() => {
        this.memoryDb.delete(key);
      }, expireSeconds * 1000);
    }
  }

  async del(key: string): Promise<void> {
    if (this.isOnline) {
      try {
        await this.client.del(key);
        return;
      } catch {}
    }
    this.memoryDb.delete(key);
  }

  async pushToList(key: string, value: string): Promise<void> {
    if (this.isOnline) {
      try {
        await this.client.rPush(key, value);
        return;
      } catch {}
    }
    const current = this.memoryDb.get(key) ? JSON.parse(this.memoryDb.get(key)!) : [];
    current.push(value);
    this.memoryDb.set(key, JSON.stringify(current));
  }

  async popFromList(key: string): Promise<string | null> {
    if (this.isOnline) {
      try {
        return await this.client.lPop(key);
      } catch {}
    }
    const current = this.memoryDb.get(key) ? JSON.parse(this.memoryDb.get(key)!) : [];
    if (current.length === 0) return null;
    const val = current.shift();
    this.memoryDb.set(key, JSON.stringify(current));
    return val;
  }

  async getList(key: string): Promise<string[]> {
    if (this.isOnline) {
      try {
        return await this.client.lRange(key, 0, -1);
      } catch {}
    }
    return this.memoryDb.get(key) ? JSON.parse(this.memoryDb.get(key)!) : [];
  }
}
