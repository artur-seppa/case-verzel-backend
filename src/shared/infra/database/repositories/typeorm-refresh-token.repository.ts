import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../../../domain/entities/refresh-token';
import {
  CreateRefreshTokenInput,
  RefreshTokenRepository,
} from '../../../domain/repositories/refresh-token.repository';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';

@Injectable()
export class TypeOrmRefreshTokenRepository implements RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repository: Repository<RefreshTokenEntity>,
  ) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    const entity = this.repository.create({ ...input, revokedAt: null });
    return this.repository.save(entity);
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.repository.findOneBy({ tokenHash });
  }

  async revoke(id: string): Promise<void> {
    await this.repository.update({ id }, { revokedAt: new Date() });
  }
}
