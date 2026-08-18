import { Reservation } from '../entities/reservation';
import { ReservationStatus } from '../enums';

export interface CreateReservationInput {
  id: string;
  eventId: string;
  clientId: string;
  status: ReservationStatus;
}

export interface ReservationRepository {
  create(input: CreateReservationInput): Promise<Reservation>;
  findById(id: string): Promise<Reservation | null>;
  updateStatus(id: string, status: ReservationStatus): Promise<void>;
}

export const RESERVATION_REPOSITORY = Symbol('RESERVATION_REPOSITORY');
