import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Reservation } from '../../../shared/domain/entities/reservation';
import { ReservationStatus } from '../../../shared/domain/enums';
import { eventResponseSchema, toEventResponse } from '../../events/dto/event-response.dto';
import { seatResponseSchema } from '../../events/dto/seat-response.dto';
import type { ReservationWithEventAndSeat } from '../use-cases/get-reservation-by-id.use-case';

export const reservationResponseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  clientId: z.string(),
  status: z.enum(ReservationStatus),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export class ReservationResponseDto extends createZodDto(
  reservationResponseSchema,
) {}

export function toReservationResponse(reservation: Reservation) {
  return {
    ...reservation,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
  };
}

export const reservationDetailResponseSchema = reservationResponseSchema.extend({
  event: eventResponseSchema,
  seat: seatResponseSchema.nullable(),
});

export class ReservationDetailResponseDto extends createZodDto(
  reservationDetailResponseSchema,
) {}

export function toReservationDetailResponse(
  reservation: ReservationWithEventAndSeat,
) {
  return {
    ...toReservationResponse(reservation),
    event: toEventResponse(reservation.event),
    seat: reservation.seat,
  };
}
