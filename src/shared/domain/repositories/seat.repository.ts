import { Seat } from '../entities/seat';

export interface CreateSeatInput {
  id: string;
  eventId: string;
  row: string;
  number: number;
  label: string;
}

export interface SeatRepository {
  createMany(seats: CreateSeatInput[]): Promise<Seat[]>;
  findByEventId(eventId: string): Promise<Seat[]>;
  findById(id: string): Promise<Seat | null>;
  findByReservationId(reservationId: string): Promise<Seat | null>;
  countByEventId(eventId: string): Promise<number>;
  holdSeat(seatId: string, reservationId: string): Promise<Seat>;
  markSold(seatId: string): Promise<Seat>;
  release(seatId: string): Promise<Seat>;
}

export const SEAT_REPOSITORY = Symbol('SEAT_REPOSITORY');
