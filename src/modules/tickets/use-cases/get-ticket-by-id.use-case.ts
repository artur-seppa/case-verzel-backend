import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { TICKET_REPOSITORY } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketRepository } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketDetail } from '../ticket-detail';

export interface GetTicketByIdInput {
  ticketId: string;
  clientId: string;
}

@Injectable()
export class GetTicketByIdUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY)
    private readonly ticketRepository: TicketRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
  ) {}

  async execute(input: GetTicketByIdInput): Promise<TicketDetail> {
    const ticket = await this.ticketRepository.findById(input.ticketId);
    if (!ticket) {
      throw new NotFoundError('Ingresso', input.ticketId);
    }
    if (ticket.clientId !== input.clientId) {
      throw new ForbiddenError('Esse ingresso não pertence a você');
    }

    const event = await this.eventRepository.findById(ticket.eventId);
    if (!event) {
      throw new NotFoundError('Evento', ticket.eventId);
    }

    const seat = await this.seatRepository.findById(ticket.seatId);
    if (!seat) {
      throw new NotFoundError('Assento', ticket.seatId);
    }

    return { ticket, event, seat };
  }
}
