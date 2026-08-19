import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Reservation } from '../../../shared/domain/entities/reservation';
import { ReservationStatus } from '../../../shared/domain/enums';

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
