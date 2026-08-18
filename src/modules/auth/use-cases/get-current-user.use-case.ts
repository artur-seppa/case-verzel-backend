import { Inject, Injectable } from '@nestjs/common';
import type { User } from '../../../shared/domain/entities/user';
import { NotFoundError } from '../../../shared/domain/errors';
import { USER_REPOSITORY } from '../../../shared/domain/repositories/user.repository';
import type { UserRepository } from '../../../shared/domain/repositories/user.repository';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('Usuário', userId);
    }
    return user;
  }
}
