"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const redis_1 = require("redis");
let RedisService = class RedisService {
    constructor() {
        this.memoryDb = new Map();
        this.isOnline = false;
    }
    async onModuleInit() {
        try {
            this.client = (0, redis_1.createClient)({
                url: process.env.REDIS_URL || 'redis://localhost:6379'
            });
            this.client.on('error', (err) => {
                console.warn('Redis client error, falling back to memory storage', err.message);
                this.isOnline = false;
            });
            await this.client.connect();
            this.isOnline = true;
            console.log('Redis cache adapter connected successfully');
        }
        catch (e) {
            console.warn('Failed to start Redis, running on in-memory storage fallback:', e.message);
            this.isOnline = false;
        }
    }
    async onModuleDestroy() {
        if (this.isOnline && this.client) {
            await this.client.disconnect();
        }
    }
    async get(key) {
        if (this.isOnline) {
            try {
                return await this.client.get(key);
            }
            catch {
                return this.memoryDb.get(key) || null;
            }
        }
        return this.memoryDb.get(key) || null;
    }
    async set(key, value, expireSeconds) {
        if (this.isOnline) {
            try {
                if (expireSeconds) {
                    await this.client.setEx(key, expireSeconds, value);
                }
                else {
                    await this.client.set(key, value);
                }
                return;
            }
            catch { }
        }
        this.memoryDb.set(key, value);
        if (expireSeconds) {
            setTimeout(() => {
                this.memoryDb.delete(key);
            }, expireSeconds * 1000);
        }
    }
    async del(key) {
        if (this.isOnline) {
            try {
                await this.client.del(key);
                return;
            }
            catch { }
        }
        this.memoryDb.delete(key);
    }
    async pushToList(key, value) {
        if (this.isOnline) {
            try {
                await this.client.rPush(key, value);
                return;
            }
            catch { }
        }
        const current = this.memoryDb.get(key) ? JSON.parse(this.memoryDb.get(key)) : [];
        current.push(value);
        this.memoryDb.set(key, JSON.stringify(current));
    }
    async popFromList(key) {
        if (this.isOnline) {
            try {
                return await this.client.lPop(key);
            }
            catch { }
        }
        const current = this.memoryDb.get(key) ? JSON.parse(this.memoryDb.get(key)) : [];
        if (current.length === 0)
            return null;
        const val = current.shift();
        this.memoryDb.set(key, JSON.stringify(current));
        return val;
    }
    async getList(key) {
        if (this.isOnline) {
            try {
                return await this.client.lRange(key, 0, -1);
            }
            catch { }
        }
        return this.memoryDb.get(key) ? JSON.parse(this.memoryDb.get(key)) : [];
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)()
], RedisService);
//# sourceMappingURL=redis.service.js.map