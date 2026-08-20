import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../../../domain/entities/event';
import { Paginated, PaginationParams } from '../../../domain/pagination';
import {
  CreateEventInput,
  EventRepository,
} from '../../../domain/repositories/event.repository';
import { EventEntity } from '../entities/event.entity';

@Injectable()
export class TypeOrmEventRepository implements EventRepository {
  constructor(
    @InjectRepository(EventEntity)
    private readonly repository: Repository<EventEntity>,
  ) {}

  async create(input: CreateEventInput): Promise<Event> {
    const entity = this.repository.create(input);
    return this.repository.save(entity);
  }

  findById(id: string): Promise<Event | null> {
    return this.repository.findOneBy({ id });
  }

  async findAll({ page, limit }: PaginationParams): Promise<Paginated<Event>> {
    const [items, total] = await this.repository.findAndCount({
      order: { date: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async findByOrganizerId(
    organizerId: string,
    { page, limit }: PaginationParams,
  ): Promise<Paginated<Event>> {
    const [items, total] = await this.repository.findAndCount({
      where: { organizerId },
      order: { date: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}
