import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ulid } from 'ulid';
import type { User } from '../../../shared/domain/entities/user';
import { UserRole } from '../../../shared/domain/enums';
import { ConflictError } from '../../../shared/domain/errors';
import { USER_REPOSITORY } from '../../../shared/domain/repositories/user.repository';
import type { UserRepository } from '../../../shared/domain/repositories/user.repository';
import { TokenService } from '../token.service';
import type { TokenPair } from '../token.service';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: UserRole.CLIENT | UserRole.ORGANIZER;
}

export interface RegisterOutput {
  user: User;
  tokens: TokenPair;
}

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const user = await this.userRepository.create({
      id: ulid(),
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });

    const tokens = await this.tokenService.issueTokenPair(user);

    return { user, tokens };
  }
}
