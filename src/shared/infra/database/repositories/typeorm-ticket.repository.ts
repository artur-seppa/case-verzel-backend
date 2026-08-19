import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../../../domain/entities/ticket';
import {
  CreateTicketInput,
  TicketRepository,
} from '../../../domain/repositories/ticket.repository';
import { TicketEntity } from '../entities/ticket.entity';

@Injectable()
export class TypeOrmTicketRepository implements TicketRepository {
  constructor(
    @InjectRepository(TicketEntity)
    private readonly repository: Repository<TicketEntity>,
  ) {}

  async create(input: CreateTicketInput): Promise<Ticket> {
    const entity = this.repository.create(input);
    return this.repository.save(entity);
  }
}
