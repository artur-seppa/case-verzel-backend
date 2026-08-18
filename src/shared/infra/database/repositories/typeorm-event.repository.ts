import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../../../domain/entities/event';
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

  findAll(): Promise<Event[]> {
    return this.repository.find({ order: { date: 'ASC' } });
  }

  findByOrganizerId(organizerId: string): Promise<Event[]> {
    return this.repository.find({
      where: { organizerId },
      order: { date: 'ASC' },
    });
  }
}
