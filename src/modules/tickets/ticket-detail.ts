import type { Event } from '../../shared/domain/entities/event';
import type { Seat } from '../../shared/domain/entities/seat';
import type { Ticket } from '../../shared/domain/entities/ticket';

export interface TicketDetail {
  ticket: Ticket;
  event: Event;
  seat: Seat;
}
