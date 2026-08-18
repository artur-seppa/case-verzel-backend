import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../../src/modules/auth/token.service';
import { TypeOrmRefreshTokenRepository } from '../../src/shared/infra/database/repositories/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from '../../src/shared/infra/database/repositories/typeorm-user.repository';
import { RefreshTokenEntity } from '../../src/shared/infra/database/entities/refresh-token.entity';
import { UserEntity } from '../../src/shared/infra/database/entities/user.entity';
import { getTestDataSource } from './test-data-source';

export async function buildAuthDependencies() {
  const dataSource = await getTestDataSource();

  const userRepository = new TypeOrmUserRepository(
    dataSource.getRepository(UserEntity),
  );
  const refreshTokenRepository = new TypeOrmRefreshTokenRepository(
    dataSource.getRepository(RefreshTokenEntity),
  );

  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test_access_secret_only_for_tests',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'test_refresh_secret_only_for_tests',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });

  const tokenService = new TokenService(
    new JwtService(),
    config,
    refreshTokenRepository,
  );

  return { userRepository, refreshTokenRepository, tokenService };
}
