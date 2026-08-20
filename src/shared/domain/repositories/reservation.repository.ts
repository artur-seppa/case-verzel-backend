import { Reservation } from '../entities/reservation';
import { ReservationStatus } from '../enums';

export interface CreateReservationInput {
  id: string;
  eventId: string;
  clientId: string;
  status: ReservationStatus;
  expiresAt: Date;
}

export interface ReservationRepository {
  create(input: CreateReservationInput): Promise<Reservation>;
  createWithSeatHold(
    input: CreateReservationInput,
    seatId: string,
  ): Promise<Reservation>;
  findById(id: string): Promise<Reservation | null>;
  updateStatus(id: string, status: ReservationStatus): Promise<void>;
  startProcessingIfPending(id: string): Promise<boolean>;
  confirmIfProcessing(id: string): Promise<boolean>;
  revertToPendingIfProcessing(id: string): Promise<boolean>;
  cancelIfPending(id: string): Promise<boolean>;
}

export const RESERVATION_REPOSITORY = Symbol('RESERVATION_REPOSITORY');
