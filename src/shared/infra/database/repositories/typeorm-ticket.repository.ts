import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../../../domain/entities/ticket';
import { TicketStatus } from '../../../domain/enums';
import { ConflictError, NotFoundError } from '../../../domain/errors';
import { Paginated, PaginationParams } from '../../../domain/pagination';
import {
  CreateTicketInput,
  TicketRepository,
  ValidatedTicket,
} from '../../../domain/repositories/ticket.repository';
import { EventEntity } from '../entities/event.entity';
import { SeatEntity } from '../entities/seat.entity';
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

  findById(id: string): Promise<Ticket | null> {
    return this.repository.findOneBy({ id });
  }

  findByShareToken(shareToken: string): Promise<Ticket | null> {
    return this.repository.findOneBy({ shareToken });
  }

  async findByClientId(
    clientId: string,
    { page, limit }: PaginationParams,
  ): Promise<Paginated<Ticket>> {
    const [items, total] = await this.repository.findAndCount({
      where: { clientId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async validate(id: string): Promise<ValidatedTicket> {
    return this.repository.manager.transaction(async (manager) => {
      const ticket = await manager.findOneBy(TicketEntity, { id });
      if (!ticket) {
        throw new NotFoundError('Ingresso', id);
      }

      const event = await manager.findOneBy(EventEntity, {
        id: ticket.eventId,
      });
      if (!event) {
        throw new NotFoundError('Evento', ticket.eventId);
      }

      const seat = await manager.findOneBy(SeatEntity, { id: ticket.seatId });
      if (!seat) {
        throw new NotFoundError('Assento', ticket.seatId);
      }

      const usedAt = new Date();
      const result = await manager.update(
        TicketEntity,
        { id: ticket.id, status: TicketStatus.VALID },
        { status: TicketStatus.USED, usedAt },
      );
      if ((result.affected ?? 0) === 0) {
        throw new ConflictError('Ingresso já foi utilizado');
      }

      return {
        ticket: { ...ticket, status: TicketStatus.USED, usedAt },
        event,
        seat,
      };
    });
  }
}
