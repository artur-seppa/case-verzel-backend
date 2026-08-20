import { Event } from '../entities/event';
import { Paginated, PaginationParams } from '../pagination';
import { Seat } from '../entities/seat';
import { Ticket } from '../entities/ticket';

export interface CreateTicketInput {
  id: string;
  reservationId: string;
  eventId: string;
  seatId: string;
  clientId: string;
  qrToken: string;
  shareToken: string;
}

export interface ValidatedTicket {
  ticket: Ticket;
  event: Event;
  seat: Seat;
}

export interface TicketRepository {
  create(input: CreateTicketInput): Promise<Ticket>;
  findById(id: string): Promise<Ticket | null>;
  findByShareToken(shareToken: string): Promise<Ticket | null>;
  findByClientId(
    clientId: string,
    pagination: PaginationParams,
  ): Promise<Paginated<Ticket>>;
  validate(id: string): Promise<ValidatedTicket>;
}

export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');
