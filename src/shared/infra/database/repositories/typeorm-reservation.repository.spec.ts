import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { ReservationStatus, UserRole } from '../../../domain/enums';
import { buildAuthDependencies } from '../../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../../test/factories/event.factory';

async function createPendingReservation() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();

  const organizer = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.ORGANIZER }),
  );
  const client = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.CLIENT }),
  );
  const event = await eventRepository.create(
    buildCreateEventInput(organizer.id, { capacity: 1, price: '49.90' }),
  );
  const reservation = await reservationRepository.create({
    id: ulid(),
    eventId: event.id,
    clientId: client.id,
    status: ReservationStatus.PENDING_PAYMENT,
    expiresAt: new Date(Date.now() + 600_000),
  });

  return { reservationRepository, reservation };
}

describe('TypeOrmReservationRepository CAS transitions', () => {
  it('moves a pending reservation to processing', async () => {
    const { reservationRepository, reservation } =
      await createPendingReservation();

    const started =
      await reservationRepository.startProcessingIfPending(reservation.id);

    expect(started).toBe(true);
    const updated = await reservationRepository.findById(reservation.id);
    expect(updated?.status).toBe(ReservationStatus.PROCESSING);
  });

  it('never lets two concurrent calls both move the same reservation to processing', async () => {
    const { reservationRepository, reservation } =
      await createPendingReservation();

    const results = await Promise.all([
      reservationRepository.startProcessingIfPending(reservation.id),
      reservationRepository.startProcessingIfPending(reservation.id),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('confirms a processing reservation but refuses a merely-pending one', async () => {
    const { reservationRepository, reservation } =
      await createPendingReservation();

    expect(await reservationRepository.confirmIfProcessing(reservation.id)).toBe(
      false,
    );

    await reservationRepository.startProcessingIfPending(reservation.id);
    expect(await reservationRepository.confirmIfProcessing(reservation.id)).toBe(
      true,
    );

    const confirmed = await reservationRepository.findById(reservation.id);
    expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('reverts a processing reservation back to pending_payment', async () => {
    const { reservationRepository, reservation } =
      await createPendingReservation();
    await reservationRepository.startProcessingIfPending(reservation.id);

    const reverted =
      await reservationRepository.revertToPendingIfProcessing(reservation.id);

    expect(reverted).toBe(true);
    const updated = await reservationRepository.findById(reservation.id);
    expect(updated?.status).toBe(ReservationStatus.PENDING_PAYMENT);
  });
});
