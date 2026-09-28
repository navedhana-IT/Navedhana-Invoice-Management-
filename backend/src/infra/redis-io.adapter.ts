import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { env } from '../config/env';

/** Socket.IO over Redis pub/sub so events published by any API replica or the worker reach every socket. */
export class RedisIoAdapter extends IoAdapter {
  private adapter?: ReturnType<typeof createAdapter>;

  connect() {
    const pub = new Redis(env().REDIS_URL);
    this.adapter = createAdapter(pub, pub.duplicate());
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, path: '/socket.io', transports: ['websocket', 'polling'] });
    if (this.adapter) server.adapter(this.adapter);
    return server;
  }
}
