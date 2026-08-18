import { Inject, Injectable } from '@nestjs/common';
import type { User } from '../../../shared/domain/entities/user';
import { UnauthorizedError } from '../../../shared/domain/errors';
import { USER_REPOSITORY } from '../../../shared/domain/repositories/user.repository';
import type { UserRepository } from '../../../shared/domain/repositories/user.repository';
import { TokenService } from '../token.service';
import type { TokenPair } from '../token.service';

export interface RefreshSessionOutput {
  user: User;
  tokens: TokenPair;
}

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(refreshToken: string): Promise<RefreshSessionOutput> {
    const stored = await this.tokenService.findValidRefreshToken(refreshToken);
    if (!stored) {
      throw new UnauthorizedError('Sessão expirada, faça login novamente');
    }

    await this.tokenService.revokeRefreshToken(stored.id);

    const user = await this.userRepository.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedError('Sessão expirada, faça login novamente');
    }

    const tokens = await this.tokenService.issueTokenPair(user);

    return { user, tokens };
  }
}
