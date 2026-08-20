import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/errors';
import type {
  Paginated,
  PaginationParams,
} from '../../../shared/domain/pagination';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { TICKET_REPOSITORY } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketRepository } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketDetail } from '../ticket-detail';

@Injectable()
export class ListMyTicketsUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY)
    private readonly ticketRepository: TicketRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
  ) {}

  async execute(
    clientId: string,
    pagination: PaginationParams,
  ): Promise<Paginated<TicketDetail>> {
    const { items: tickets, total } =
      await this.ticketRepository.findByClientId(clientId, pagination);

    const details = await Promise.all(
      tickets.map(async (ticket) => {
        const event = await this.eventRepository.findById(ticket.eventId);
        if (!event) {
          throw new NotFoundError('Evento', ticket.eventId);
        }

        const seat = await this.seatRepository.findById(ticket.seatId);
        if (!seat) {
          throw new NotFoundError('Assento', ticket.seatId);
        }

        return { ticket, event, seat };
      }),
    );

    return { items: details, total };
  }
}
