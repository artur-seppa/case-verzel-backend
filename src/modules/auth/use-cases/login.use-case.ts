import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { User } from '../../../shared/domain/entities/user';
import { UnauthorizedError } from '../../../shared/domain/errors';
import { USER_REPOSITORY } from '../../../shared/domain/repositories/user.repository';
import type { UserRepository } from '../../../shared/domain/repositories/user.repository';
import { TokenService } from '../token.service';
import type { TokenPair } from '../token.service';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  user: User;
  tokens: TokenPair;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('E-mail ou senha inválidos');
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedError('E-mail ou senha inválidos');
    }

    const tokens = await this.tokenService.issueTokenPair(user);

    return { user, tokens };
  }
}
