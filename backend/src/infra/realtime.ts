import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
import { env } from '../config/env';
import type { Id } from '../common/ids';

export const userRoom = (userId: Id) => `user:${userId}`;

/**
 * Publishes Socket.IO events through Redis, so the API and the worker both reach browsers connected
 * to any API replica. Events only ever target a single user's room.
 */
@Injectable()
export class Realtime implements OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  private redis?: Redis;
  private emitter?: Emitter;

  private get io() {
    if (!this.emitter) {
      this.redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
      this.redis.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
      this.emitter = new Emitter(this.redis);
    }
    return this.emitter;
  }

  toUsers(userIds: Id[], event: string, payload: Record<string, unknown>) {
    if (!userIds.length) return;
    try {
      // The Redis emitter packs with msgpack, which rejects bigint; round-trip so ids go out as numbers.
      this.io.to(userIds.map(userRoom)).emit(event, JSON.parse(JSON.stringify(payload)));
    } catch (e) {
      this.logger.warn(`Emit ${event} failed: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [Realtime], exports: [Realtime] })
export class RealtimeModule {}
