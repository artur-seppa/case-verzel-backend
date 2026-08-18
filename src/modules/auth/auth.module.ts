import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../shared/infra/database/entities/user.entity';
import { RefreshTokenEntity } from '../../shared/infra/database/entities/refresh-token.entity';
import { TypeOrmUserRepository } from '../../shared/infra/database/repositories/typeorm-user.repository';
import { TypeOrmRefreshTokenRepository } from '../../shared/infra/database/repositories/typeorm-refresh-token.repository';
import { USER_REPOSITORY } from '../../shared/domain/repositories/user.repository';
import { REFRESH_TOKEN_REPOSITORY } from '../../shared/domain/repositories/refresh-token.repository';
import { AuthCookieService } from '../../shared/http/cookies/auth-cookie.service';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { GetCurrentUserUseCase } from './use-cases/get-current-user.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshSessionUseCase } from './use-cases/refresh-session.use-case';
import { RegisterUseCase } from './use-cases/register.use-case';

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
  ],
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: TypeOrmRefreshTokenRepository,
    },
    TokenService,
    AuthCookieService,
    JwtAuthGuard,
    RolesGuard,
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
  ],
  exports: [USER_REPOSITORY, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
