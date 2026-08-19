import { ReservationStatus } from '../enums';

export interface Reservation {
  id: string;
  eventId: string;
  clientId: string;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
}
