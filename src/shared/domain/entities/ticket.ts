import { TicketStatus } from '../enums';

export interface Ticket {
  id: string;
  reservationId: string;
  eventId: string;
  seatId: string;
  clientId: string;
  qrToken: string;
  shareToken: string;
  status: TicketStatus;
  usedAt: Date | null;
  createdAt: Date;
}
