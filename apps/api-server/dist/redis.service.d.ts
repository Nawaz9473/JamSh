import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private client;
    private memoryDb;
    private isOnline;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, expireSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    pushToList(key: string, value: string): Promise<void>;
    popFromList(key: string): Promise<string | null>;
    getList(key: string): Promise<string[]>;
}
