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

export interface TicketRepository {
  create(input: CreateTicketInput): Promise<Ticket>;
}

export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');
