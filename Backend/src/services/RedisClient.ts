import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

export class RedisClient {
  private static instance: RedisClient;
  private client: RedisClientType | null = null;
  private connected: boolean = false;

  private constructor() {}

  static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  async connect(): Promise<void> {
    try {
      this.client = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error', err);
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.connected = false;
      });

      await this.client.connect();
      this.connected = true;
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis connection closed');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    return this.client;
  }

  // Acquire distributed lock
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    try {
      const result = await this.client!.set(
        `lock:${key}`,
        Date.now().toString(),
        {
          NX: true,
          EX: ttlSeconds
        }
      );
      return result === 'OK';
    } catch (error) {
      logger.error(`Failed to acquire lock for ${key}`, error);
      return false;
    }
  }

  // Release distributed lock
  async releaseLock(key: string): Promise<void> {
    try {
      await this.client!.del(`lock:${key}`);
    } catch (error) {
      logger.error(`Failed to release lock for ${key}`, error);
    }
  }

  // Cache data
  async setCache(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client!.setEx(`cache:${key}`, ttlSeconds, serialized);
      } else {
        await this.client!.set(`cache:${key}`, serialized);
      }
    } catch (error) {
      logger.error(`Failed to set cache for ${key}`, error);
    }
  }

  // Get cached data
  async getCache<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client!.get(`cache:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Failed to get cache for ${key}`, error);
      return null;
    }
  }

  // Delete cache
  async deleteCache(key: string): Promise<void> {
    try {
      await this.client!.del(`cache:${key}`);
    } catch (error) {
      logger.error(`Failed to delete cache for ${key}`, error);
    }
  }

  // Publish message to channel
  async publish(channel: string, message: any): Promise<void> {
    try {
      const serialized = JSON.stringify(message);
      await this.client!.publish(channel, serialized);
    } catch (error) {
      logger.error(`Failed to publish to channel ${channel}`, error);
    }
  }

  // Subscribe to channel
  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    try {
      const subscriber = this.client!.duplicate();
      await subscriber.connect();

      await subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch (error) {
          logger.error(`Failed to parse message from channel ${channel}`, error);
        }
      });
    } catch (error) {
      logger.error(`Failed to subscribe to channel ${channel}`, error);
    }
  }
}
