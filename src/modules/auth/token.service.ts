import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ulid } from 'ulid';
import type { User } from '../../shared/domain/entities/user';
import { REFRESH_TOKEN_REPOSITORY } from '../../shared/domain/repositories/refresh-token.repository';
import type { RefreshTokenRepository } from '../../shared/domain/repositories/refresh-token.repository';
import { parseDurationToSeconds } from '../../shared/utils/parse-duration';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private issueAccessToken(user: Pick<User, 'id' | 'role'>): string {
    return this.jwtService.sign(
      { sub: user.id, role: user.role },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
      },
    );
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(40).toString('hex');
    const expiresAt = new Date(
      Date.now() +
        parseDurationToSeconds(
          this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
        ) *
          1000,
    );

    await this.refreshTokenRepository.create({
      id: ulid(),
      userId,
      tokenHash: this.hash(raw),
      expiresAt,
    });

    return raw;
  }

  async issueTokenPair(user: Pick<User, 'id' | 'role'>): Promise<TokenPair> {
    return {
      accessToken: this.issueAccessToken(user),
      refreshToken: await this.issueRefreshToken(user.id),
    };
  }

  async findValidRefreshToken(raw: string) {
    const tokenHash = this.hash(raw);
    const token = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (!token || token.revokedAt || token.expiresAt < new Date()) {
      return null;
    }
    return token;
  }

  revokeRefreshToken(id: string): Promise<void> {
    return this.refreshTokenRepository.revoke(id);
  }
}
