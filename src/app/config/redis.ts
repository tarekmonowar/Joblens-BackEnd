import Redis from "ioredis";
import { envVars } from "./env";

export const TTL = {
  JOBS: 900,
  JOB: 1800,
  ANALYTICS: 3600,
} as const;

export type CacheNamespace = "jobs" | "analytics";

const CACHE_GEN_KEY: Record<CacheNamespace, string> = {
  jobs: "cache:gen:jobs",
  analytics: "cache:gen:analytics",
};

const GEN_MEMORY_TTL_MS = 5_000;

const createClient = (): Redis => {
  if (envVars.REDIS_URL) {
    return new Redis(envVars.REDIS_URL, { keyPrefix: "app1:" });
  }

  return new Redis({
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    keyPrefix: "app1:",
    tls: envVars.REDIS_TLS ? {} : undefined,
  });
};

class RedisService {
  private readonly client = createClient();
  private readonly genMemory = new Map<
    CacheNamespace,
    { value: number; at: number }
  >();

  getClient(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async set(key: string, value: unknown, ttlSec?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSec !== undefined) {
      await this.client.set(key, serialized, "EX", ttlSec);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async getCacheGeneration(namespace: CacheNamespace): Promise<number> {
    const now = Date.now();
    const cached = this.genMemory.get(namespace);
    if (cached && now - cached.at < GEN_MEMORY_TTL_MS) {
      return cached.value;
    }

    const raw = await this.client.get(CACHE_GEN_KEY[namespace]);
    const value = raw ? parseInt(raw, 10) : 0;
    this.genMemory.set(namespace, { value, at: now });
    return value;
  }

  async invalidateCache(namespace: CacheNamespace): Promise<number> {
    const value = await this.client.incr(CACHE_GEN_KEY[namespace]);
    this.genMemory.set(namespace, { value, at: Date.now() });
    return value;
  }

  async bumpGeneration(namespace: CacheNamespace): Promise<number> {
    return this.invalidateCache(namespace);
  }

  async getGeneration(namespace: CacheNamespace): Promise<number> {
    return this.getCacheGeneration(namespace);
  }

  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await fn();
    await this.set(key, fresh, ttlSec);
    return fresh;
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

export const RedisServices = new RedisService();
