import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CONNECTION } from './redis-connection.token';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CONNECTION) private readonly connection: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.quit();
  }
}
