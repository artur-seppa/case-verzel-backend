import { SeatStatus } from '../enums';

export interface Seat {
  id: string;
  eventId: string;
  row: string;
  number: number;
  label: string;
  status: SeatStatus;
  reservationId: string | null;
}
