import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit {
  private redisClient: any = null;
  private memoryCache = new Map<string, { value: any; expiresAt: number | null }>();
  private readonly logger = new Logger(CacheService.name);

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redisClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 0) return false; // disable infinite retries
            return 1000;
          },
        },
      });
      this.redisClient.on('error', (err: any) => {
        this.logger.warn(`Redis connection error: ${err.message}. Using in-memory cache.`);
        if (this.redisClient) {
          this.redisClient.disconnect().catch(() => {});
        }
        this.redisClient = null;
      });
      await this.redisClient.connect();
      this.logger.log('Connected to Redis Cache successfully.');
    } catch (error) {
      this.logger.warn('Could not establish Redis connection. Using in-memory fallback cache.');
      this.redisClient = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redisClient) {
      try {
        const val = await this.redisClient.get(key);
        return val ? (JSON.parse(val) as T) : null;
      } catch (err) {
        this.logger.error(`Redis get error for key ${key}:`, err);
      }
    }
    
    // In-memory fallback lookup
    const item = this.memoryCache.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const stringified = JSON.stringify(value);
    if (this.redisClient) {
      try {
        if (ttlSeconds) {
          await this.redisClient.set(key, stringified, { EX: ttlSeconds });
        } else {
          await this.redisClient.set(key, stringified);
        }
        return;
      } catch (err) {
        this.logger.error(`Redis set error for key ${key}:`, err);
      }
    }

    // In-memory fallback store
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryCache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
        return;
      } catch (err) {
        this.logger.error(`Redis del error for key ${key}:`, err);
      }
    }
    this.memoryCache.delete(key);
  }

  async clearAll(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.flushAll();
        return;
      } catch (err) {
        this.logger.error('Redis flushAll error:', err);
      }
    }
    this.memoryCache.clear();
  }
}
