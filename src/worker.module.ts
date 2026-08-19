import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { validateEnv } from './config/env.schema';
import { entities } from './shared/infra/database/entities';
import { REDIS_CONNECTION } from './shared/infra/redis/redis-connection.token';
import { RedisModule } from './shared/infra/redis/redis.module';
import { AuthGuardsModule } from './shared/http/guards/auth-guards.module';
import { WorkerPaymentsModule } from './modules/payments/worker-payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities,
        synchronize: false,
        ssl:
          config.get('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    RedisModule,
    BullModule.forRootAsync({
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({ connection }),
    }),
    AuthGuardsModule,
    WorkerPaymentsModule,
  ],
})
export class WorkerModule {}
