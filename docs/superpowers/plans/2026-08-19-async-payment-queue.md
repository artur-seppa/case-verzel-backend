# Async Payment Queue (BullMQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the double-charge/no-refund race in reservation payment (CAS before the gateway charge, not after) and move the actual gateway call off the request thread into a BullMQ-backed worker process, with SSE for the client to learn the result.

**Architecture:** `POST /reservations/:id/payment` now only validates the reservation and does an atomic Postgres CAS `pending_payment → processing` before returning `202`; the real gateway call moves to a `ChargeReservationUseCase` that only a separate worker process invokes, via a BullMQ job. The HTTP process exposes `GET /reservations/:id/payment/events` (SSE) backed by BullMQ's `QueueEvents`, so the client learns the outcome without polling.

**Tech Stack:** NestJS 11 (Fastify), TypeORM/Postgres, `bullmq` + `@nestjs/bullmq` + `ioredis` (new), Vitest against real Postgres/Redis (no mocks, matches existing repo convention).

**Spec:** `docs/superpowers/specs/2026-08-19-async-payment-queue-design.md`

## Global Constraints

- No mocks in tests for use cases/repositories/queue behavior — every spec in this plan runs against a real Postgres (existing `.env.test` / `docker-compose.yml` instance) and a real Redis (new `redis` service added in Task 4). This matches the project's existing testing philosophy (see `README.md`, "Testes").
- No code comments (explain intent through naming/README, not inline comments) — matches this project's established style.
- Card decline (`approved: false`) is a normal return value, never a thrown exception, and must never trigger a BullMQ retry.
- Reservation status transitions are only ever done via compare-and-swap (`UPDATE ... WHERE status = X`), never via unconditional `updateStatus` in the payment flow — the whole point of this plan is closing the window where that wasn't true.
- Stripe webhook reconciliation is explicitly out of scope (documented risk in the spec, section 6) — do not implement it as part of this plan.

---

### Task 1: Reservation repository — `processing` status and CAS transitions

**Files:**
- Modify: `src/shared/domain/enums.ts`
- Modify: `src/shared/domain/repositories/reservation.repository.ts`
- Modify: `src/shared/infra/database/repositories/typeorm-reservation.repository.ts`
- Create: `src/shared/infra/database/migrations/1787200000000-ReservationProcessingStatus.ts`
- Create: `src/shared/infra/database/repositories/typeorm-reservation.repository.spec.ts`

**Interfaces:**
- Produces: `ReservationStatus.PROCESSING` enum member; `ReservationRepository.startProcessingIfPending(id: string): Promise<boolean>`, `.confirmIfProcessing(id: string): Promise<boolean>` (replaces `confirmIfPending`), `.revertToPendingIfProcessing(id: string): Promise<boolean>`. `cancelIfPending` and `updateStatus` are unchanged.

- [ ] **Step 1: Add the enum member**

In `src/shared/domain/enums.ts`, change:

```ts
export enum ReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  DECLINED = 'declined',
}
```

to:

```ts
export enum ReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  PROCESSING = 'processing',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  DECLINED = 'declined',
}
```

- [ ] **Step 2: Write the migration**

Create `src/shared/infra/database/migrations/1787200000000-ReservationProcessingStatus.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationProcessingStatus1787200000000
  implements MigrationInterface
{
  name = 'ReservationProcessingStatus1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "reservations_status_enum" ADD VALUE 'processing' AFTER 'pending_payment';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "reservations_status_enum" RENAME TO "reservations_status_enum_old";
      CREATE TYPE "reservations_status_enum" AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'declined');
      ALTER TABLE "reservations" ALTER COLUMN "status" TYPE "reservations_status_enum" USING ("status"::text::"reservations_status_enum");
      DROP TYPE "reservations_status_enum_old";
    `);
  }
}
```

`down()` will fail if any row is currently `processing` at rollback time — same limitation Postgres imposes on every enum-value removal, not specific to this migration.

- [ ] **Step 3: Run the migration against the local dev/test Postgres**

Run: `npm run migration:run`
Expected: output lists `ReservationProcessingStatus1787200000000` as applied. The test database picks this migration up automatically the next time the Vitest `globalSetup` runs (it calls `AppDataSource.runMigrations()`), so no separate manual step is needed for tests.

- [ ] **Step 4: Update the domain repository interface**

In `src/shared/domain/repositories/reservation.repository.ts`, replace:

```ts
export interface ReservationRepository {
  create(input: CreateReservationInput): Promise<Reservation>;
  findById(id: string): Promise<Reservation | null>;
  updateStatus(id: string, status: ReservationStatus): Promise<void>;
  confirmIfPending(id: string): Promise<boolean>;
  cancelIfPending(id: string): Promise<boolean>;
}
```

with:

```ts
export interface ReservationRepository {
  create(input: CreateReservationInput): Promise<Reservation>;
  findById(id: string): Promise<Reservation | null>;
  updateStatus(id: string, status: ReservationStatus): Promise<void>;
  startProcessingIfPending(id: string): Promise<boolean>;
  confirmIfProcessing(id: string): Promise<boolean>;
  revertToPendingIfProcessing(id: string): Promise<boolean>;
  cancelIfPending(id: string): Promise<boolean>;
}
```

- [ ] **Step 5: Update the TypeORM implementation**

In `src/shared/infra/database/repositories/typeorm-reservation.repository.ts`, replace the `confirmIfPending`/`cancelIfPending`/`transitionIfPending` block with:

```ts
  async startProcessingIfPending(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.PROCESSING,
    );
  }

  async confirmIfProcessing(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PROCESSING,
      ReservationStatus.CONFIRMED,
    );
  }

  async revertToPendingIfProcessing(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PROCESSING,
      ReservationStatus.PENDING_PAYMENT,
    );
  }

  async cancelIfPending(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.CANCELLED,
    );
  }

  private async transition(
    id: string,
    from: ReservationStatus,
    to: ReservationStatus,
  ): Promise<boolean> {
    const result = await this.repository.update(
      { id, status: from },
      { status: to },
    );
    return (result.affected ?? 0) > 0;
  }
```

- [ ] **Step 6: Write the repository spec (failing first — the methods above already exist, so instead confirm the test fails for the *right* reason by writing it before Step 4/5 if you're doing strict TDD, or write it now and treat a passing run as your Step 4/5 verification)**

Create `src/shared/infra/database/repositories/typeorm-reservation.repository.spec.ts`:

```ts
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
```

- [ ] **Step 7: Run the spec**

Run: `npm test -- typeorm-reservation.repository.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/shared/domain/enums.ts src/shared/domain/repositories/reservation.repository.ts src/shared/infra/database/repositories/typeorm-reservation.repository.ts src/shared/infra/database/repositories/typeorm-reservation.repository.spec.ts src/shared/infra/database/migrations/1787200000000-ReservationProcessingStatus.ts
git commit -m "feat: add processing reservation status with CAS transitions"
```

---

### Task 2: `RequestPaymentUseCase` — CAS before the gateway call

**Files:**
- Create: `src/shared/domain/services/payment-queue.service.ts`
- Create: `src/modules/payments/use-cases/request-payment.use-case.ts`
- Create: `src/modules/payments/use-cases/request-payment.use-case.spec.ts`

**Interfaces:**
- Consumes: `ReservationRepository.startProcessingIfPending`/`cancelIfPending` (Task 1), `SeatRepository.findByReservationId`/`.release` (existing).
- Produces: `PaymentQueueService` port + `PAYMENT_QUEUE` token (consumed by Task 5's BullMQ adapter); `RequestPaymentUseCase.execute(input: { reservationId, clientId, cardNumber }): Promise<{ reservationId: string }>` (consumed by Task 8's controller).

- [ ] **Step 1: Define the payment queue port**

Create `src/shared/domain/services/payment-queue.service.ts`:

```ts
export interface EnqueueChargeInput {
  reservationId: string;
  cardNumber: string;
}

export interface PaymentQueueService {
  enqueueCharge(input: EnqueueChargeInput): Promise<void>;
}

export const PAYMENT_QUEUE = Symbol('PAYMENT_QUEUE');
```

- [ ] **Step 2: Write the failing spec**

Create `src/modules/payments/use-cases/request-payment.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../shared/domain/enums';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/errors';
import type {
  EnqueueChargeInput,
  PaymentQueueService,
} from '../../../shared/domain/services/payment-queue.service';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { CreateReservationUseCase } from '../../reservations/use-cases/create-reservation.use-case';
import { RequestPaymentUseCase } from './request-payment.use-case';

class FakePaymentQueue implements PaymentQueueService {
  readonly enqueued: EnqueueChargeInput[] = [];

  async enqueueCharge(input: EnqueueChargeInput): Promise<void> {
    this.enqueued.push(input);
  }
}

async function setupPendingReservation(holdSeconds = 600) {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
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
  const [seat] = await seatRepository.createMany([
    buildCreateSeatInput(event.id),
  ]);

  const createReservation = new CreateReservationUseCase(
    reservationRepository,
    seatRepository,
    holdSeconds,
  );
  const reservation = await createReservation.execute({
    eventId: event.id,
    clientId: client.id,
    seatId: seat.id,
  });

  const queue = new FakePaymentQueue();
  const useCase = new RequestPaymentUseCase(
    reservationRepository,
    seatRepository,
    queue,
  );

  return {
    client,
    reservation,
    seat,
    seatRepository,
    reservationRepository,
    queue,
    useCase,
  };
}

describe('RequestPaymentUseCase', () => {
  it('moves the reservation to processing and enqueues a charge job', async () => {
    const { client, reservation, reservationRepository, queue, useCase } =
      await setupPendingReservation();

    const result = await useCase.execute({
      reservationId: reservation.id,
      clientId: client.id,
      cardNumber: '4242424242424242',
    });

    expect(result).toEqual({ reservationId: reservation.id });
    expect(queue.enqueued).toEqual([
      { reservationId: reservation.id, cardNumber: '4242424242424242' },
    ]);

    const updated = await reservationRepository.findById(reservation.id);
    expect(updated?.status).toBe('processing');
  });

  it('rejects paying for a reservation that belongs to another client', async () => {
    const { reservation, useCase } = await setupPendingReservation();
    const { userRepository } = await buildAuthDependencies();
    const stranger = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: stranger.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects paying for a reservation that is no longer pending', async () => {
    const { client, reservation, useCase } = await setupPendingReservation();

    await useCase.execute({
      reservationId: reservation.id,
      clientId: client.id,
      cardNumber: '4242424242424242',
    });

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects paying for a reservation that does not exist', async () => {
    const { client, useCase } = await setupPendingReservation();

    await expect(
      useCase.execute({
        reservationId: 'does-not-exist',
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('expires an overdue reservation, releases the seat and rejects the payment', async () => {
    const { client, reservation, seat, seatRepository, useCase } =
      await setupPendingReservation(-1);

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(ConflictError);

    const releasedSeat = await seatRepository.findById(seat.id);
    expect(releasedSeat?.status).toBe('available');
    expect(releasedSeat?.reservationId).toBeNull();
  });

  it('never lets two concurrent requests both enqueue a job for the same reservation', async () => {
    const { client, reservation, queue, useCase } =
      await setupPendingReservation();

    const results = await Promise.allSettled([
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictError,
    );
    expect(queue.enqueued).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- request-payment.use-case.spec.ts`
Expected: FAIL — `Cannot find module './request-payment.use-case'`.

- [ ] **Step 4: Implement `RequestPaymentUseCase`**

Create `src/modules/payments/use-cases/request-payment.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ReservationStatus, SeatStatus } from '../../../shared/domain/enums';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/errors';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { PAYMENT_QUEUE } from '../../../shared/domain/services/payment-queue.service';
import type { PaymentQueueService } from '../../../shared/domain/services/payment-queue.service';

export interface RequestPaymentInput {
  reservationId: string;
  clientId: string;
  cardNumber: string;
}

export interface RequestPaymentOutput {
  reservationId: string;
}

@Injectable()
export class RequestPaymentUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
    @Inject(PAYMENT_QUEUE) private readonly paymentQueue: PaymentQueueService,
  ) {}

  async execute(input: RequestPaymentInput): Promise<RequestPaymentOutput> {
    const reservation = await this.reservationRepository.findById(
      input.reservationId,
    );
    if (!reservation) {
      throw new NotFoundError('Reserva', input.reservationId);
    }
    if (reservation.clientId !== input.clientId) {
      throw new ForbiddenError('Essa reserva não pertence a você');
    }
    if (reservation.status !== ReservationStatus.PENDING_PAYMENT) {
      throw new ConflictError('Esta reserva já foi processada');
    }
    if (reservation.expiresAt.getTime() < Date.now()) {
      await this.expireReservation(reservation.id);
      throw new ConflictError('O tempo para pagar essa reserva expirou');
    }

    const started = await this.reservationRepository.startProcessingIfPending(
      reservation.id,
    );
    if (!started) {
      throw new ConflictError('Esta reserva já foi processada');
    }

    await this.paymentQueue.enqueueCharge({
      reservationId: reservation.id,
      cardNumber: input.cardNumber,
    });

    return { reservationId: reservation.id };
  }

  private async expireReservation(reservationId: string): Promise<void> {
    const cancelled =
      await this.reservationRepository.cancelIfPending(reservationId);
    if (!cancelled) return;

    const seat = await this.seatRepository.findByReservationId(reservationId);
    if (seat && seat.status === SeatStatus.HELD) {
      await this.seatRepository.release(seat.id);
    }
  }
}
```

- [ ] **Step 5: Run the spec again**

Run: `npm test -- request-payment.use-case.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/domain/services/payment-queue.service.ts src/modules/payments/use-cases/request-payment.use-case.ts src/modules/payments/use-cases/request-payment.use-case.spec.ts
git commit -m "feat: add RequestPaymentUseCase with CAS-before-charge"
```

---

### Task 3: `ChargeReservationUseCase` — replaces `ProcessPaymentUseCase`

**Files:**
- Create: `src/modules/payments/use-cases/charge-reservation.use-case.ts`
- Create: `src/modules/payments/use-cases/charge-reservation.use-case.spec.ts`
- Delete: `src/modules/payments/use-cases/process-payment.use-case.ts`
- Delete: `src/modules/payments/use-cases/process-payment.use-case.spec.ts`

**Interfaces:**
- Consumes: `ReservationRepository.confirmIfProcessing`/`.revertToPendingIfProcessing` (Task 1).
- Produces: `ChargeReservationUseCase.execute(input: { reservationId, cardNumber }): Promise<{ payment: Payment; ticket: Ticket | null }>` (consumed by Task 6's processor). This becomes the BullMQ job's return value, so its shape is also what Task 8's SSE stream parses — keep `payment`/`ticket` field names exactly as here.

- [ ] **Step 1: Write the failing spec**

Create `src/modules/payments/use-cases/charge-reservation.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import {
  PaymentStatus,
  ReservationStatus,
  SeatStatus,
  UserRole,
} from '../../../shared/domain/enums';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { verifyQrToken } from '../../../shared/utils/qr-token';
import { SimulatedPaymentGatewayService } from '../../../shared/infra/payment/simulated-payment-gateway.service';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { ChargeReservationUseCase } from './charge-reservation.use-case';

const QR_SECRET = 'test_qr_secret_for_charge_reservation_use_case_spec';
const APPROVE_CARD = '4242424242424242';
const DECLINE_CARD = '4000000000000002';

async function setupProcessingReservation() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();
  const { paymentRepository, ticketRepository } =
    await buildPaymentsDependencies();

  const organizer = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.ORGANIZER }),
  );
  const client = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.CLIENT }),
  );
  const event = await eventRepository.create(
    buildCreateEventInput(organizer.id, { capacity: 1, price: '49.90' }),
  );
  const [seat] = await seatRepository.createMany([
    buildCreateSeatInput(event.id),
  ]);
  const reservation = await reservationRepository.create({
    id: ulid(),
    eventId: event.id,
    clientId: client.id,
    status: ReservationStatus.PENDING_PAYMENT,
    expiresAt: new Date(Date.now() + 600_000),
  });
  await seatRepository.holdSeat(seat.id, reservation.id);
  await reservationRepository.startProcessingIfPending(reservation.id);

  const useCase = new ChargeReservationUseCase(
    reservationRepository,
    seatRepository,
    eventRepository,
    paymentRepository,
    ticketRepository,
    new SimulatedPaymentGatewayService(),
    QR_SECRET,
  );

  return {
    event,
    seat,
    client,
    reservation,
    seatRepository,
    reservationRepository,
    useCase,
  };
}

describe('ChargeReservationUseCase', () => {
  it('approves a valid card, confirms the reservation and issues a ticket', async () => {
    const { event, seat, client, reservation, seatRepository, useCase } =
      await setupProcessingReservation();

    const { payment, ticket } = await useCase.execute({
      reservationId: reservation.id,
      cardNumber: APPROVE_CARD,
    });

    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(payment.amount).toBe(event.price);
    expect(ticket).not.toBeNull();
    expect(ticket?.seatId).toBe(seat.id);
    expect(ticket?.clientId).toBe(client.id);
    expect(verifyQrToken(ticket!.qrToken, QR_SECRET)).toBe(ticket!.id);

    const soldSeat = await seatRepository.findById(seat.id);
    expect(soldSeat?.status).toBe(SeatStatus.SOLD);
  });

  it('declines the known decline-test card and reverts the reservation to pending_payment', async () => {
    const { reservation, seat, seatRepository, reservationRepository, useCase } =
      await setupProcessingReservation();

    const { payment, ticket } = await useCase.execute({
      reservationId: reservation.id,
      cardNumber: DECLINE_CARD,
    });

    expect(payment.status).toBe(PaymentStatus.DECLINED);
    expect(ticket).toBeNull();

    const reverted = await reservationRepository.findById(reservation.id);
    expect(reverted?.status).toBe(ReservationStatus.PENDING_PAYMENT);
    const heldSeat = await seatRepository.findById(seat.id);
    expect(heldSeat?.status).toBe(SeatStatus.HELD);
  });

  it('lets the client retry with a different card after a decline', async () => {
    const { reservation, reservationRepository, useCase } =
      await setupProcessingReservation();

    await useCase.execute({
      reservationId: reservation.id,
      cardNumber: DECLINE_CARD,
    });
    await reservationRepository.startProcessingIfPending(reservation.id);

    const { payment, ticket } = await useCase.execute({
      reservationId: reservation.id,
      cardNumber: APPROVE_CARD,
    });

    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(ticket).not.toBeNull();

    const confirmed = await reservationRepository.findById(reservation.id);
    expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('rejects confirming a reservation that was never moved to processing', async () => {
    const { reservationRepository, useCase, event, client } =
      await setupProcessingReservation();

    const otherReservation = await reservationRepository.create({
      id: ulid(),
      eventId: event.id,
      clientId: client.id,
      status: ReservationStatus.PENDING_PAYMENT,
      expiresAt: new Date(Date.now() + 600_000),
    });

    await expect(
      useCase.execute({
        reservationId: otherReservation.id,
        cardNumber: APPROVE_CARD,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects charging a reservation that does not exist', async () => {
    const { useCase } = await setupProcessingReservation();

    await expect(
      useCase.execute({
        reservationId: 'does-not-exist',
        cardNumber: APPROVE_CARD,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('never lets two concurrent approvals both confirm the same reservation', async () => {
    const { reservation, seatRepository, useCase } =
      await setupProcessingReservation();

    const results = await Promise.allSettled([
      useCase.execute({ reservationId: reservation.id, cardNumber: APPROVE_CARD }),
      useCase.execute({ reservationId: reservation.id, cardNumber: APPROVE_CARD }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictError,
    );

    const seat = await seatRepository.findByReservationId(reservation.id);
    expect(seat?.status).toBe(SeatStatus.SOLD);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- charge-reservation.use-case.spec.ts`
Expected: FAIL — `Cannot find module './charge-reservation.use-case'`.

- [ ] **Step 3: Implement `ChargeReservationUseCase`**

Create `src/modules/payments/use-cases/charge-reservation.use-case.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Payment } from '../../../shared/domain/entities/payment';
import type { Ticket } from '../../../shared/domain/entities/ticket';
import { PaymentStatus } from '../../../shared/domain/enums';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { PAYMENT_REPOSITORY } from '../../../shared/domain/repositories/payment.repository';
import type { PaymentRepository } from '../../../shared/domain/repositories/payment.repository';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { TICKET_REPOSITORY } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketRepository } from '../../../shared/domain/repositories/ticket.repository';
import { PAYMENT_GATEWAY } from '../../../shared/domain/services/payment-gateway.service';
import type { PaymentGatewayService } from '../../../shared/domain/services/payment-gateway.service';
import { QR_SECRET, signQrToken } from '../../../shared/utils/qr-token';

export interface ChargeReservationInput {
  reservationId: string;
  cardNumber: string;
}

export interface ChargeReservationOutput {
  payment: Payment;
  ticket: Ticket | null;
}

@Injectable()
export class ChargeReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: PaymentRepository,
    @Inject(TICKET_REPOSITORY)
    private readonly ticketRepository: TicketRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGateway: PaymentGatewayService,
    @Inject(QR_SECRET) private readonly qrSecret: string,
  ) {}

  async execute(
    input: ChargeReservationInput,
  ): Promise<ChargeReservationOutput> {
    const reservation = await this.reservationRepository.findById(
      input.reservationId,
    );
    if (!reservation) {
      throw new NotFoundError('Reserva', input.reservationId);
    }

    const event = await this.eventRepository.findById(reservation.eventId);
    if (!event) {
      throw new NotFoundError('Evento', reservation.eventId);
    }

    const { approved } = await this.paymentGateway.charge({
      reservationId: reservation.id,
      amount: event.price,
      cardNumber: input.cardNumber,
    });

    const payment = await this.paymentRepository.create({
      id: ulid(),
      reservationId: reservation.id,
      status: approved ? PaymentStatus.APPROVED : PaymentStatus.DECLINED,
      amount: event.price,
    });

    if (!approved) {
      await this.reservationRepository.revertToPendingIfProcessing(
        reservation.id,
      );
      return { payment, ticket: null };
    }

    const confirmed = await this.reservationRepository.confirmIfProcessing(
      reservation.id,
    );
    if (!confirmed) {
      throw new ConflictError('Esta reserva já foi processada');
    }

    const seat = await this.seatRepository.findByReservationId(reservation.id);
    if (!seat) {
      throw new NotFoundError('Assento', reservation.id);
    }
    await this.seatRepository.markSold(seat.id);

    const ticketId = ulid();
    const ticket = await this.ticketRepository.create({
      id: ticketId,
      reservationId: reservation.id,
      eventId: reservation.eventId,
      seatId: seat.id,
      clientId: reservation.clientId,
      qrToken: signQrToken(ticketId, this.qrSecret),
      shareToken: randomBytes(16).toString('hex'),
    });

    return { payment, ticket };
  }
}
```

- [ ] **Step 4: Delete the old use case and its spec**

```bash
git rm src/modules/payments/use-cases/process-payment.use-case.ts src/modules/payments/use-cases/process-payment.use-case.spec.ts
```

- [ ] **Step 5: Run the spec**

Run: `npm test -- charge-reservation.use-case.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full suite to catch dangling references to the deleted file**

Run: `npm test`
Expected: PASS. If anything still imports `ProcessPaymentUseCase` (e.g. `payments.module.ts`, `payments.controller.ts`), it will fail to compile — fix those imports now by pointing them at `RequestPaymentUseCase`/`ChargeReservationUseCase` (full wiring happens in Task 5–8, so at this point it's fine if `payments.module.ts` temporarily only registers `RequestPaymentUseCase` and `ChargeReservationUseCase` as providers without a queue yet — just make sure nothing references the deleted class).

- [ ] **Step 7: Commit**

```bash
git add -A src/modules/payments/use-cases/
git commit -m "feat: replace ProcessPaymentUseCase with RequestPaymentUseCase + ChargeReservationUseCase"
```

---

### Task 4: Redis infrastructure (BullMQ dependency, `docker-compose`, `RedisModule`)

**Files:**
- Modify: `package.json`
- Modify: `src/config/env.schema.ts`
- Modify: `.env.example`
- Modify: `.env.test`
- Modify: `docker-compose.yml`
- Create: `src/shared/infra/redis/redis-connection.token.ts`
- Create: `src/shared/infra/redis/redis.module.ts`
- Modify: `src/app.module.ts`
- Create: `src/shared/infra/redis/redis-connection.spec.ts`

**Interfaces:**
- Produces: `REDIS_CONNECTION` DI token providing a shared `ioredis.Redis` instance (consumed by Task 5's `BullModule.forRootAsync`, Task 8's `QueueEvents` provider, and Task 7's worker bootstrap).

- [ ] **Step 1: Add dependencies**

```bash
npm install bullmq@^6.1.2 @nestjs/bullmq@^11.0.5 ioredis@^6.0.0
```

- [ ] **Step 2: Add `REDIS_URL` to env validation**

In `src/config/env.schema.ts`, add a field next to `DATABASE_URL`:

```ts
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
```

- [ ] **Step 3: Add `REDIS_URL` to `.env.example`**

In `.env.example`, after the `DATABASE_URL` block:

```
# Local (docker compose): redis://localhost:6380
REDIS_URL=redis://localhost:6380/0
```

- [ ] **Step 4: Add `REDIS_URL` to `.env.test`**

In `.env.test`, after `DATABASE_URL`:

```
REDIS_URL=redis://localhost:6380/1
```

Using database index `1` for tests (vs `0` for dev) keeps test job data out of whatever's running in a dev server against the same local Redis, mirroring how `case_verzel_test` is a separate Postgres database from `case_verzel` on the same server.

- [ ] **Step 5: Add the `redis` service to `docker-compose.yml`**

In `docker-compose.yml`, add a sibling service to `postgres` and a sibling volume to `case-verzel-db`:

```yaml
services:
  postgres:
    # ... unchanged ...

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - '6380:6379'
    volumes:
      - case-verzel-redis:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  case-verzel-db:
  case-verzel-redis:
```

- [ ] **Step 6: Start the new service**

Run: `docker compose up -d redis`
Expected: container starts; `docker compose ps` shows `redis` as `healthy` within a few seconds.

- [ ] **Step 7: Create the Redis connection token**

Create `src/shared/infra/redis/redis-connection.token.ts`:

```ts
export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
```

- [ ] **Step 8: Create `RedisModule`**

Create `src/shared/infra/redis/redis.module.ts`:

```ts
import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CONNECTION } from './redis-connection.token';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CONNECTION) private readonly connection: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.quit();
  }
}
```

`maxRetriesPerRequest: null` is required by BullMQ whenever you hand it a connection you created yourself (as opposed to a plain options object) — omitting it makes BullMQ throw at startup.

- [ ] **Step 9: Wire `RedisModule` and `BullModule.forRootAsync` into `AppModule`**

In `src/app.module.ts`, add imports:

```ts
import { BullModule } from '@nestjs/bullmq';
import type { Redis } from 'ioredis';
import { RedisModule } from './shared/infra/redis/redis.module';
import { REDIS_CONNECTION } from './shared/infra/redis/redis-connection.token';
```

and add to the `imports` array, right after `TypeOrmModule.forRootAsync(...)`:

```ts
    RedisModule,
    BullModule.forRootAsync({
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({ connection }),
    }),
```

- [ ] **Step 10: Write the smoke spec**

Create `src/shared/infra/redis/redis-connection.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import Redis from 'ioredis';

describe('Redis test connection', () => {
  it('connects to REDIS_URL and responds to PING', async () => {
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
    try {
      await expect(redis.ping()).resolves.toBe('PONG');
    } finally {
      await redis.quit();
    }
  });
});
```

- [ ] **Step 11: Extend the shared test teardown to flush the test Redis DB between tests**

In `test/support/setup.ts`, replace:

```ts
import { config } from 'dotenv';

config({ path: '.env.test' });

import { afterEach } from 'vitest';
import { resetDatabase } from './test-data-source';

afterEach(async () => {
  await resetDatabase();
});
```

with:

```ts
import { config } from 'dotenv';

config({ path: '.env.test' });

import { afterEach } from 'vitest';
import Redis from 'ioredis';
import { resetDatabase } from './test-data-source';

const testRedis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  lazyConnect: true,
});

afterEach(async () => {
  await resetDatabase();
  try {
    await testRedis.flushdb();
  } catch {
    testRedis.disconnect();
  }
});
```

This client is test-only cleanup, never touched by BullMQ, so it does not need `maxRetriesPerRequest: null` — instead it's tuned to fail fast (`enableOfflineQueue: false`, no retry) and swallow the failure rather than hang. Without this, an unreachable Redis makes ioredis queue/retry the flush indefinitely, which times out every single test in the suite via this same `afterEach`, not just Redis-specific ones — found during Task 4 implementation, fixed inline here rather than left as a footgun for whoever runs the suite before Redis is up.

- [ ] **Step 12: Run the spec and the full suite**

Run: `npm test -- redis-connection.spec.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS — confirms `AppModule` still compiles/boots correctly with the new `RedisModule`/`BullModule` wiring (Vitest's `globalSetup` initializes the real `AppDataSource`, but nothing yet boots the full `AppModule` — if any later task's e2e-style test does, this is the point where a misconfigured `REDIS_URL` would surface).

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json src/config/env.schema.ts .env.example .env.test docker-compose.yml src/shared/infra/redis/ src/app.module.ts test/support/setup.ts
git commit -m "feat: add Redis infrastructure (BullMQ dependency, docker-compose service, RedisModule)"
```

---

### Task 5: BullMQ payments queue — producer side

**Files:**
- Create: `src/shared/infra/queue/payments-queue.constants.ts`
- Create: `src/shared/infra/queue/bullmq-payment-queue.service.ts`
- Create: `src/shared/infra/queue/bullmq-payment-queue.service.spec.ts`
- Create: `test/support/build-payments-queue-dependencies.ts`
- Modify: `src/modules/payments/payments.module.ts`

**Interfaces:**
- Consumes: `PaymentQueueService` (Task 2), `REDIS_CONNECTION` (Task 4).
- Produces: `PAYMENTS_QUEUE_NAME` constant (consumed by Task 6's processor and Task 8's `QueueEvents` provider — must stay `'payments'` everywhere).

- [ ] **Step 1: Define the queue name constant**

Create `src/shared/infra/queue/payments-queue.constants.ts`:

```ts
export const PAYMENTS_QUEUE_NAME = 'payments';
```

- [ ] **Step 2: Create the test queue helper**

Create `test/support/build-payments-queue-dependencies.ts`:

```ts
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PAYMENTS_QUEUE_NAME } from '../../src/shared/infra/queue/payments-queue.constants';

export function buildTestPaymentsQueue() {
  const connection = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(PAYMENTS_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  });

  async function close(): Promise<void> {
    await queue.close();
    await connection.quit();
  }

  return { queue, connection, close };
}
```

- [ ] **Step 3: Write the failing spec**

Create `src/shared/infra/queue/bullmq-payment-queue.service.spec.ts`:

```ts
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildTestPaymentsQueue } from '../../../../test/support/build-payments-queue-dependencies';
import { BullMqPaymentQueueService } from './bullmq-payment-queue.service';

describe('BullMqPaymentQueueService', () => {
  const { queue, close } = buildTestPaymentsQueue();
  const service = new BullMqPaymentQueueService(queue);

  afterEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await close();
  });

  it('enqueues a charge job keyed by reservationId', async () => {
    await service.enqueueCharge({
      reservationId: 'res_1',
      cardNumber: '4242424242424242',
    });

    const job = await queue.getJob('res_1');
    expect(job).not.toBeNull();
    expect(job?.data).toEqual({
      reservationId: 'res_1',
      cardNumber: '4242424242424242',
    });
  });

  it('does not enqueue a second job for a reservationId that is already queued', async () => {
    await service.enqueueCharge({
      reservationId: 'res_2',
      cardNumber: '4242424242424242',
    });
    await service.enqueueCharge({
      reservationId: 'res_2',
      cardNumber: '4242424242424242',
    });

    const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
    const total = Object.values(counts).reduce(
      (sum, n) => sum + (n as number),
      0,
    );
    expect(total).toBe(1);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- bullmq-payment-queue.service.spec.ts`
Expected: FAIL — `Cannot find module './bullmq-payment-queue.service'`.

- [ ] **Step 5: Implement `BullMqPaymentQueueService`**

Create `src/shared/infra/queue/bullmq-payment-queue.service.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  EnqueueChargeInput,
  PaymentQueueService,
} from '../../domain/services/payment-queue.service';
import { PAYMENTS_QUEUE_NAME } from './payments-queue.constants';

@Injectable()
export class BullMqPaymentQueueService implements PaymentQueueService {
  constructor(
    @InjectQueue(PAYMENTS_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async enqueueCharge(input: EnqueueChargeInput): Promise<void> {
    await this.queue.add('charge-reservation', input, {
      jobId: input.reservationId,
    });
  }
}
```

- [ ] **Step 6: Run the spec**

Run: `npm test -- bullmq-payment-queue.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Wire the queue and both use cases into `PaymentsModule`**

Replace the contents of `src/modules/payments/payments.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { PaymentEntity } from '../../shared/infra/database/entities/payment.entity';
import { TicketEntity } from '../../shared/infra/database/entities/ticket.entity';
import { PAYMENT_REPOSITORY } from '../../shared/domain/repositories/payment.repository';
import { TICKET_REPOSITORY } from '../../shared/domain/repositories/ticket.repository';
import { TypeOrmPaymentRepository } from '../../shared/infra/database/repositories/typeorm-payment.repository';
import { TypeOrmTicketRepository } from '../../shared/infra/database/repositories/typeorm-ticket.repository';
import { PAYMENT_GATEWAY } from '../../shared/domain/services/payment-gateway.service';
import type { PaymentGatewayService } from '../../shared/domain/services/payment-gateway.service';
import { PAYMENT_QUEUE } from '../../shared/domain/services/payment-queue.service';
import { SimulatedPaymentGatewayService } from '../../shared/infra/payment/simulated-payment-gateway.service';
import { StripePaymentGatewayService } from '../../shared/infra/payment/stripe-payment-gateway.service';
import { BullMqPaymentQueueService } from '../../shared/infra/queue/bullmq-payment-queue.service';
import { PAYMENTS_QUEUE_NAME } from '../../shared/infra/queue/payments-queue.constants';
import { QR_SECRET } from '../../shared/utils/qr-token';
import { EventsModule } from '../events/events.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { PaymentsController } from './payments.controller';
import { RequestPaymentUseCase } from './use-cases/request-payment.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, TicketEntity]),
    EventsModule,
    ReservationsModule,
    BullModule.registerQueue({
      name: PAYMENTS_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
  ],
  controllers: [PaymentsController],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    { provide: TICKET_REPOSITORY, useClass: TypeOrmTicketRepository },
    { provide: PAYMENT_QUEUE, useClass: BullMqPaymentQueueService },
    {
      provide: QR_SECRET,
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>('TICKET_QR_SECRET'),
      inject: [ConfigService],
    },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService): PaymentGatewayService => {
        if (config.get('PAYMENT_GATEWAY') === 'stripe') {
          const stripe = new Stripe(config.getOrThrow('STRIPE_SECRET_KEY'));
          return new StripePaymentGatewayService(stripe);
        }
        return new SimulatedPaymentGatewayService();
      },
      inject: [ConfigService],
    },
    RequestPaymentUseCase,
  ],
})
export class PaymentsModule {}
```

Note this HTTP-side module only registers `RequestPaymentUseCase` — not `ChargeReservationUseCase`. `ChargeReservationUseCase` and its full dependency set (event/payment/ticket repositories, gateway) belong only to the worker-only `WorkerPaymentsModule` created in Task 6, since only the worker process ever calls it; the HTTP process has no `@Processor`, so it never needs those dependencies wired up. `PAYMENT_QUEUE` here is the producer side (`queue.add`); Task 6's `WorkerPaymentsModule` separately calls `BullModule.registerQueue({ name: PAYMENTS_QUEUE_NAME })` for the consumer side — this is normal BullMQ usage: producer and consumer are separate `registerQueue` calls, typically in separate processes, both pointed at the same queue name and Redis.

Also update `payments.controller.ts` now just enough to compile against the new use case (Task 8 replaces this again with the final `202`/SSE contract — this is an intentional intermediate step, not rework, since Task 8 needs the SSE plumbing from Tasks 4–7 first): change the constructor and `pay()` body to use `RequestPaymentUseCase`, keeping the response shape as-is for now:

```ts
  constructor(private readonly requestPaymentUseCase: RequestPaymentUseCase) {}

  @Post()
  @Roles(UserRole.CLIENT)
  async pay(
    @Param('reservationId') reservationId: string,
    @Body() dto: PayReservationDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.requestPaymentUseCase.execute({
      reservationId,
      clientId: currentUser.id,
      cardNumber: dto.cardNumber,
    });
  }
```

(drop the `ZodResponse`/`toPaymentResponse` bits for now — Task 8 replaces them with the real `202` contract; this intermediate version only needs to compile and pass the existing use-case-level specs.)

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/shared/infra/queue/ test/support/build-payments-queue-dependencies.ts src/modules/payments/payments.module.ts src/modules/payments/payments.controller.ts
git commit -m "feat: add BullMQ payments queue producer and wire into PaymentsModule"
```

---

### Task 6: `ChargeReservationProcessor` — worker-side consumer

**Files:**
- Create: `src/shared/infra/payment/classify-gateway-error.ts`
- Create: `src/shared/infra/payment/classify-gateway-error.spec.ts`
- Create: `src/modules/payments/use-cases/charge-reservation.processor.ts`
- Create: `src/modules/payments/use-cases/charge-reservation.processor.spec.ts`
- Create: `src/modules/payments/worker-payments.module.ts`

**Interfaces:**
- Consumes: `ChargeReservationUseCase` (Task 3), `ReservationRepository.revertToPendingIfProcessing` (Task 1), `PAYMENTS_QUEUE_NAME` (Task 5).
- Produces: `WorkerPaymentsModule` (consumed by Task 7's `worker.ts`).

- [ ] **Step 1: Write the failing spec for the error classifier**

Create `src/shared/infra/payment/classify-gateway-error.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isRetryableGatewayError } from './classify-gateway-error';

describe('isRetryableGatewayError', () => {
  it.each([
    ['StripeConnectionError', true],
    ['StripeAPIError', true],
    ['StripeRateLimitError', true],
    ['StripeAuthenticationError', false],
    ['StripeInvalidRequestError', false],
    ['StripePermissionError', false],
  ])('type=%s -> retryable=%s', (type, expected) => {
    expect(isRetryableGatewayError({ type })).toBe(expected);
  });

  it('treats errors without a recognized Stripe type as non-retryable', () => {
    expect(isRetryableGatewayError(new Error('boom'))).toBe(false);
    expect(isRetryableGatewayError(null)).toBe(false);
    expect(isRetryableGatewayError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- classify-gateway-error.spec.ts`
Expected: FAIL — `Cannot find module './classify-gateway-error'`.

- [ ] **Step 3: Implement the classifier**

Create `src/shared/infra/payment/classify-gateway-error.ts`:

```ts
const RETRYABLE_STRIPE_ERROR_TYPES = new Set([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
]);

export function isRetryableGatewayError(error: unknown): boolean {
  const type = (error as { type?: string } | null | undefined)?.type;
  return typeof type === 'string' && RETRYABLE_STRIPE_ERROR_TYPES.has(type);
}
```

- [ ] **Step 4: Run the spec**

Run: `npm test -- classify-gateway-error.spec.ts`
Expected: PASS (7 cases).

- [ ] **Step 5: Implement `ChargeReservationProcessor`**

Create `src/modules/payments/use-cases/charge-reservation.processor.ts`:

```ts
import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { isRetryableGatewayError } from '../../../shared/infra/payment/classify-gateway-error';
import { PAYMENTS_QUEUE_NAME } from '../../../shared/infra/queue/payments-queue.constants';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import {
  ChargeReservationUseCase,
  type ChargeReservationInput,
  type ChargeReservationOutput,
} from './charge-reservation.use-case';

@Processor(PAYMENTS_QUEUE_NAME)
export class ChargeReservationProcessor extends WorkerHost {
  private readonly logger = new Logger(ChargeReservationProcessor.name);

  constructor(
    private readonly chargeReservationUseCase: ChargeReservationUseCase,
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
  ) {
    super();
  }

  async process(
    job: Job<ChargeReservationInput>,
  ): Promise<ChargeReservationOutput> {
    try {
      return await this.chargeReservationUseCase.execute(job.data);
    } catch (error) {
      if (isRetryableGatewayError(error)) {
        throw error;
      }
      throw new UnrecoverableError(
        error instanceof Error
          ? error.message
          : 'Falha ao processar pagamento',
      );
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ChargeReservationInput> | undefined,
  ): Promise<void> {
    if (!job || !job.finishedOn) return;
    const reverted =
      await this.reservationRepository.revertToPendingIfProcessing(
        job.data.reservationId,
      );
    if (reverted) {
      this.logger.warn(
        `Reserva ${job.data.reservationId} voltou para pending_payment após falha definitiva do pagamento`,
      );
    }
  }
}
```

**Correction, found by running Task 6's own spec against real Redis (not assumable from reading the docs alone):** `@OnWorkerEvent('failed')` actually fires on *every* attempt failure, not just the final one — confirmed against the installed package's own doc comment (`node_modules/bullmq/dist/esm/classes/worker.d.ts`: "'failed' ... triggered when a job has thrown an exception," with no exhausted-retries qualifier). Without the `!job.finishedOn` guard above, the handler reverted the reservation to `pending_payment` after the *first* failed attempt of the retry test, and then the retry's second (successful) attempt hit `ConflictError` trying to `confirmIfProcessing` a reservation that was no longer `processing` — the job then failed for real with that `ConflictError` as its message. `job.finishedOn` is only set by BullMQ once a job is truly done (confirmed in `node_modules/bullmq/dist/cjs/classes/job.js`'s `moveToFailed`: `finishedOn` is populated only in the non-retry branch); it stays unset while the job is being retried, which is exactly the signal needed here.

- [ ] **Step 6: Create `WorkerPaymentsModule`**

Create `src/modules/payments/worker-payments.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { PaymentEntity } from '../../shared/infra/database/entities/payment.entity';
import { TicketEntity } from '../../shared/infra/database/entities/ticket.entity';
import { PAYMENT_REPOSITORY } from '../../shared/domain/repositories/payment.repository';
import { TICKET_REPOSITORY } from '../../shared/domain/repositories/ticket.repository';
import { TypeOrmPaymentRepository } from '../../shared/infra/database/repositories/typeorm-payment.repository';
import { TypeOrmTicketRepository } from '../../shared/infra/database/repositories/typeorm-ticket.repository';
import { PAYMENT_GATEWAY } from '../../shared/domain/services/payment-gateway.service';
import type { PaymentGatewayService } from '../../shared/domain/services/payment-gateway.service';
import { SimulatedPaymentGatewayService } from '../../shared/infra/payment/simulated-payment-gateway.service';
import { StripePaymentGatewayService } from '../../shared/infra/payment/stripe-payment-gateway.service';
import { PAYMENTS_QUEUE_NAME } from '../../shared/infra/queue/payments-queue.constants';
import { QR_SECRET } from '../../shared/utils/qr-token';
import { EventsModule } from '../events/events.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ChargeReservationProcessor } from './use-cases/charge-reservation.processor';
import { ChargeReservationUseCase } from './use-cases/charge-reservation.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, TicketEntity]),
    EventsModule,
    ReservationsModule,
    BullModule.registerQueue({ name: PAYMENTS_QUEUE_NAME }),
  ],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    { provide: TICKET_REPOSITORY, useClass: TypeOrmTicketRepository },
    {
      provide: QR_SECRET,
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>('TICKET_QR_SECRET'),
      inject: [ConfigService],
    },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService): PaymentGatewayService => {
        if (config.get('PAYMENT_GATEWAY') === 'stripe') {
          const stripe = new Stripe(config.getOrThrow('STRIPE_SECRET_KEY'));
          return new StripePaymentGatewayService(stripe);
        }
        return new SimulatedPaymentGatewayService();
      },
      inject: [ConfigService],
    },
    ChargeReservationUseCase,
    ChargeReservationProcessor,
  ],
})
export class WorkerPaymentsModule {}
```

- [ ] **Step 7: Write the processor spec (real Redis + real Postgres, no mocks)**

Create `src/modules/payments/use-cases/charge-reservation.processor.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueEvents } from 'bullmq';
import { ulid } from 'ulid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ReservationStatus, SeatStatus, UserRole } from '../../../shared/domain/enums';
import { PAYMENT_GATEWAY } from '../../../shared/domain/services/payment-gateway.service';
import { entities } from '../../../shared/infra/database/entities';
import { PAYMENTS_QUEUE_NAME } from '../../../shared/infra/queue/payments-queue.constants';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { buildTestPaymentsQueue } from '../../../../test/support/build-payments-queue-dependencies';
import { WorkerPaymentsModule } from '../worker-payments.module';

async function setupProcessingReservation() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
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
  const [seat] = await seatRepository.createMany([
    buildCreateSeatInput(event.id),
  ]);
  const reservation = await reservationRepository.create({
    id: ulid(),
    eventId: event.id,
    clientId: client.id,
    status: ReservationStatus.PENDING_PAYMENT,
    expiresAt: new Date(Date.now() + 600_000),
  });
  await seatRepository.holdSeat(seat.id, reservation.id);
  await reservationRepository.startProcessingIfPending(reservation.id);

  return { reservation, seat, reservationRepository, seatRepository };
}

describe('ChargeReservationProcessor (real Redis + Postgres)', () => {
  let testQueue: ReturnType<typeof buildTestPaymentsQueue>;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    testQueue = buildTestPaymentsQueue();
    queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
  });

  afterEach(async () => {
    await testQueue.queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queueEvents.close();
    await testQueue.close();
  });

  async function withWorker<T>(
    configure: (
      builder: ReturnType<typeof Test.createTestingModule>,
    ) => ReturnType<typeof Test.createTestingModule>,
    run: () => Promise<T>,
  ): Promise<T> {
    const moduleRef = await configure(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              type: 'postgres',
              url: config.getOrThrow<string>('DATABASE_URL'),
              entities,
              synchronize: false,
              ssl: false,
            }),
          }),
          BullModule.forRoot({ connection: testQueue.connection }),
          WorkerPaymentsModule,
        ],
      }),
    ).compile();

    const app = await moduleRef.init();
    try {
      return await run();
    } finally {
      await app.close();
    }
  }

  it('confirms the reservation and issues a ticket when the card is approved', async () => {
    const { reservation, seat, reservationRepository, seatRepository } =
      await setupProcessingReservation();

    await withWorker(
      (builder) => builder,
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          { reservationId: reservation.id, cardNumber: '4242424242424242' },
          { jobId: reservation.id },
        );
        const job = await testQueue.queue.getJob(reservation.id);
        const result = await job!.waitUntilFinished(queueEvents, 10_000);
        expect(result.ticket).not.toBeNull();
      },
    );

    const confirmed = await reservationRepository.findById(reservation.id);
    expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
    const soldSeat = await seatRepository.findById(seat.id);
    expect(soldSeat?.status).toBe(SeatStatus.SOLD);
  });

  it('reverts the reservation to pending_payment when the card is declined', async () => {
    const { reservation, reservationRepository } =
      await setupProcessingReservation();

    await withWorker(
      (builder) => builder,
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          { reservationId: reservation.id, cardNumber: '4000000000000002' },
          { jobId: reservation.id },
        );
        const job = await testQueue.queue.getJob(reservation.id);
        const result = await job!.waitUntilFinished(queueEvents, 10_000);
        expect(result.ticket).toBeNull();
      },
    );

    const reverted = await reservationRepository.findById(reservation.id);
    expect(reverted?.status).toBe(ReservationStatus.PENDING_PAYMENT);
  });

  it('fails fast without retrying when the reservation does not exist', async () => {
    await withWorker(
      (builder) => builder,
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          { reservationId: 'does-not-exist', cardNumber: '4242424242424242' },
          { jobId: 'does-not-exist' },
        );
        const job = await testQueue.queue.getJob('does-not-exist');
        await expect(
          job!.waitUntilFinished(queueEvents, 10_000),
        ).rejects.toThrow();

        const failed = await testQueue.queue.getJob('does-not-exist');
        expect(failed?.attemptsMade).toBe(1);
      },
    );
  });

  it(
    'retries a transient gateway failure and eventually confirms the reservation',
    async () => {
      const { reservation, reservationRepository } =
        await setupProcessingReservation();

      let attempts = 0;
      const flakyGateway = {
        charge: async () => {
          attempts += 1;
          if (attempts < 2) {
            const error = new Error('temporary Stripe outage');
            (error as { type?: string }).type = 'StripeAPIError';
            throw error;
          }
          return { approved: true };
        },
      };

      await withWorker(
        (builder) =>
          builder.overrideProvider(PAYMENT_GATEWAY).useValue(flakyGateway),
        async () => {
          await testQueue.queue.add(
            'charge-reservation',
            {
              reservationId: reservation.id,
              cardNumber: '4242424242424242',
            },
            { jobId: reservation.id },
          );
          const job = await testQueue.queue.getJob(reservation.id);
          const result = await job!.waitUntilFinished(queueEvents, 10_000);
          expect(result.ticket).not.toBeNull();
          expect(attempts).toBe(2);
        },
      );

      const confirmed = await reservationRepository.findById(reservation.id);
      expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
    },
    15_000,
  );
});
```

Only one `withWorker` call is ever active at a time (each awaits `app.close()` in its `finally` before returning), so there is never more than one `Worker` consuming the shared `payments` queue — avoids a nondeterministic race between two live workers picking up the same job.

The `TypeOrmModule.forRootAsync` block in `withWorker` is required, not optional decoration: `WorkerPaymentsModule`'s `TypeOrmModule.forFeature([PaymentEntity, TicketEntity])` (and `EventsModule`/`ReservationsModule`'s own `forFeature` calls, pulled in transitively) need a root `DataSource` to resolve against. An earlier draft of this harness omitted it, which compiles fine but fails at runtime with "Nest can't resolve dependencies of the PaymentEntityRepository" — only surfaces once Redis is actually reachable and the tests get far enough to hit real repository access.

- [ ] **Step 8: Run the spec**

Run: `npm test -- charge-reservation.processor.spec.ts`
Expected: PASS (4 tests; the retry test takes a few seconds due to real backoff delay).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/shared/infra/payment/classify-gateway-error.ts src/shared/infra/payment/classify-gateway-error.spec.ts src/modules/payments/use-cases/charge-reservation.processor.ts src/modules/payments/use-cases/charge-reservation.processor.spec.ts src/modules/payments/worker-payments.module.ts
git commit -m "feat: add ChargeReservationProcessor with retryable/unrecoverable error classification"
```

---

### Task 7: Worker process entrypoint

**Files:**
- Create: `src/worker.module.ts`
- Create: `src/worker.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `RedisModule`/`REDIS_CONNECTION` (Task 4), `WorkerPaymentsModule` (Task 6).

- [ ] **Step 1: Create `WorkerModule`**

Create `src/worker.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { validateEnv } from './config/env.schema';
import { entities } from './shared/infra/database/entities';
import { REDIS_CONNECTION } from './shared/infra/redis/redis-connection.token';
import { RedisModule } from './shared/infra/redis/redis.module';
import { AuthGuardsModule } from './shared/http/guards/auth-guards.module';
import { WorkerPaymentsModule } from './modules/payments/worker-payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities,
        synchronize: false,
        ssl:
          config.get('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    RedisModule,
    BullModule.forRootAsync({
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({ connection }),
    }),
    AuthGuardsModule,
    WorkerPaymentsModule,
  ],
})
export class WorkerModule {}
```

`AuthGuardsModule` is required here even though the worker has no HTTP surface: `EventsModule` and `ReservationsModule` (imported transitively via `WorkerPaymentsModule`) each bundle an HTTP `@Controller` alongside their repository providers, and those controllers depend on `JwtAuthGuard`/`JwtService`. Nest resolves every provider a module graph declares at boot, including controllers that will never receive a request in this HTTP-less process, so the guard dependency must be satisfiable even though it's never invoked (`createApplicationContext` never runs the HTTP pipeline, so the guard has zero runtime effect here — this is a DI-resolution requirement only, not a behavior change). This is a pre-existing architectural coupling in `EventsModule`/`ReservationsModule` (mixing controllers with domain providers) that this plan didn't cause and isn't in scope to fix — found while implementing this task.

No `migrationsRun`/`migrations` config here — the HTTP process (`AppModule`) already runs migrations on boot; running them a second time from the worker risks two processes racing to apply the same migration on deploy.

- [ ] **Step 2: Create the entrypoint**

Create `src/worker.ts`:

```ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger('Worker');
  logger.log('Payment worker started, listening on the "payments" queue');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
void bootstrap();
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, next to the existing `start*` scripts:

```json
    "start:worker": "nest start --entryFile worker",
    "start:worker:dev": "nest start --entryFile worker --watch",
    "start:worker:prod": "node dist/worker",
```

- [ ] **Step 4: Verify it boots locally**

Run: `npm run start:worker:dev`
Expected: log line `Payment worker started, listening on the "payments" queue`, process stays alive (Ctrl+C to stop). Requires `docker compose up -d` (both `postgres` and `redis`) and a valid `.env` first.

- [ ] **Step 5: Commit**

```bash
git add src/worker.module.ts src/worker.ts package.json
git commit -m "feat: add worker process entrypoint for payment queue processing"
```

---

### Task 8: Controller — async `202` response and SSE payment events

**Files:**
- Create: `src/modules/payments/dto/request-payment-response.dto.ts`
- Create: `src/modules/payments/payment-event.ts`
- Create: `src/modules/payments/payment-queue-events.token.ts`
- Create: `src/modules/payments/payment-queue-events.provider.ts`
- Create: `src/modules/payments/payment-events.stream.ts`
- Create: `src/modules/payments/payment-events.stream.spec.ts`
- Modify: `src/modules/payments/payments.controller.ts`
- Modify: `src/modules/payments/payments.module.ts`
- Delete: `src/modules/payments/dto/payment-response.dto.ts` (superseded by `request-payment-response.dto.ts` + `payment-event.ts`)

**Interfaces:**
- Consumes: `RequestPaymentUseCase` (Task 2), `PAYMENTS_QUEUE_NAME`/`REDIS_CONNECTION` (Tasks 4–5), `ChargeReservationOutput` field names `payment`/`ticket` (Task 3, must match what the BullMQ job returns).

- [ ] **Step 1: Define the response DTO for the `202`**

Create `src/modules/payments/dto/request-payment-response.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const requestPaymentResponseSchema = z.object({
  reservationId: z.string(),
  status: z.literal('processing'),
});

export class RequestPaymentResponseDto extends createZodDto(
  requestPaymentResponseSchema,
) {}
```

- [ ] **Step 2: Define the SSE event shape**

Create `src/modules/payments/payment-event.ts`:

```ts
interface PaymentEventPayment {
  id: string;
  reservationId: string;
  status: string;
  amount: string;
  createdAt: string;
}

interface PaymentEventTicket {
  id: string;
  qrToken: string;
  shareToken: string;
  status: string;
  createdAt: string;
}

export interface ChargeReservationJobResult {
  payment: PaymentEventPayment;
  ticket: PaymentEventTicket | null;
}

export type PaymentEvent =
  | { type: 'confirmed'; payment: PaymentEventPayment; ticket: PaymentEventTicket }
  | { type: 'declined'; payment: PaymentEventPayment }
  | { type: 'error'; message: string };
```

- [ ] **Step 3: Create the `QueueEvents` DI token and provider**

Create `src/modules/payments/payment-queue-events.token.ts`:

```ts
export const PAYMENT_QUEUE_EVENTS = Symbol('PAYMENT_QUEUE_EVENTS');
```

Create `src/modules/payments/payment-queue-events.provider.ts`:

```ts
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';
import { PAYMENTS_QUEUE_NAME } from '../../shared/infra/queue/payments-queue.constants';
import { REDIS_CONNECTION } from '../../shared/infra/redis/redis-connection.token';

@Injectable()
export class PaymentQueueEventsProvider
  extends QueueEvents
  implements OnApplicationShutdown
{
  constructor(@Inject(REDIS_CONNECTION) connection: Redis) {
    super(PAYMENTS_QUEUE_NAME, { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
```

- [ ] **Step 4: Write the failing spec for the stream helper**

Create `src/modules/payments/payment-events.stream.spec.ts`:

```ts
import { QueueEvents, Worker } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { ReservationStatus, UserRole } from '../../shared/domain/enums';
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors';
import { PAYMENTS_QUEUE_NAME } from '../../shared/infra/queue/payments-queue.constants';
import { buildAuthDependencies } from '../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../test/factories/event.factory';
import { buildTestPaymentsQueue } from '../../../test/support/build-payments-queue-dependencies';
import { PaymentEventsStream } from './payment-events.stream';

const DECLINE_CARD = 'decline';
const ERROR_CARD = 'force-error';

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
    buildCreateEventInput(organizer.id, { capacity: 1, price: '10.00' }),
  );
  const reservation = await reservationRepository.create({
    id: ulid(),
    eventId: event.id,
    clientId: client.id,
    status: ReservationStatus.PENDING_PAYMENT,
    expiresAt: new Date(Date.now() + 600_000),
  });

  return { reservationRepository, reservation, client };
}

describe('PaymentEventsStream', () => {
  let testQueue: ReturnType<typeof buildTestPaymentsQueue>;
  let worker: Worker;

  beforeAll(async () => {
    testQueue = buildTestPaymentsQueue();
    worker = new Worker(
      PAYMENTS_QUEUE_NAME,
      async (job) => {
        if (job.data.cardNumber === ERROR_CARD) {
          throw new Error('boom');
        }
        const declined = job.data.cardNumber === DECLINE_CARD;
        return {
          payment: {
            id: 'pay_1',
            reservationId: job.data.reservationId,
            status: declined ? 'declined' : 'approved',
            amount: '10.00',
            createdAt: new Date().toISOString(),
          },
          ticket: declined
            ? null
            : {
                id: 'tic_1',
                qrToken: 'qr',
                shareToken: 'share',
                status: 'valid',
                createdAt: new Date().toISOString(),
              },
        };
      },
      { connection: testQueue.connection },
    );
    await worker.waitUntilReady();
  });

  afterEach(async () => {
    await testQueue.queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await worker.close();
    await testQueue.close();
  });

  it('emits a confirmed event when the job completes with a ticket', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const observable = await stream.watch(reservation.id, client.id);
    const received = firstValueFrom(observable);

    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: '4242424242424242' },
      { jobId: reservation.id },
    );

    expect((await received).data).toMatchObject({ type: 'confirmed' });
    await queueEvents.close();
  });

  it('emits a declined event when the job completes without a ticket', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const observable = await stream.watch(reservation.id, client.id);
    const received = firstValueFrom(observable);

    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: DECLINE_CARD },
      { jobId: reservation.id },
    );

    expect((await received).data).toMatchObject({ type: 'declined' });
    await queueEvents.close();
  });

  it('emits an error event when the job fails', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const observable = await stream.watch(reservation.id, client.id);
    const received = firstValueFrom(observable);

    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: ERROR_CARD },
      { jobId: reservation.id, attempts: 1 },
    );

    expect((await received).data).toMatchObject({ type: 'error' });
    await queueEvents.close();
  });

  it('rejects watching a reservation that belongs to another client', async () => {
    const { reservation } = await createPendingReservation();
    const { userRepository } = await buildAuthDependencies();
    const stranger = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const { reservationRepository } = await buildReservationsDependencies();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    await expect(
      stream.watch(reservation.id, stranger.id),
    ).rejects.toThrow(ForbiddenError);
    await queueEvents.close();
  });

  it('rejects watching a reservation that does not exist', async () => {
    const { reservationRepository } = await buildReservationsDependencies();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    await expect(
      stream.watch('does-not-exist', 'whoever'),
    ).rejects.toThrow(NotFoundError);
    await queueEvents.close();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -- payment-events.stream.spec.ts`
Expected: FAIL — `Cannot find module './payment-events.stream'`.

- [ ] **Step 6: Implement `PaymentEventsStream`**

Create `src/modules/payments/payment-events.stream.ts`:

```ts
import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import type { QueueEvents } from 'bullmq';
import { Observable } from 'rxjs';
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors';
import { RESERVATION_REPOSITORY } from '../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../shared/domain/repositories/reservation.repository';
import type { ChargeReservationJobResult, PaymentEvent } from './payment-event';
import { PAYMENT_QUEUE_EVENTS } from './payment-queue-events.token';

@Injectable()
export class PaymentEventsStream {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(PAYMENT_QUEUE_EVENTS) private readonly queueEvents: QueueEvents,
  ) {}

  async watch(
    reservationId: string,
    clientId: string,
  ): Promise<Observable<MessageEvent>> {
    const reservation =
      await this.reservationRepository.findById(reservationId);
    if (!reservation) {
      throw new NotFoundError('Reserva', reservationId);
    }
    if (reservation.clientId !== clientId) {
      throw new ForbiddenError('Essa reserva não pertence a você');
    }

    return new Observable<MessageEvent>((subscriber) => {
      const onCompleted = ({
        jobId,
        returnvalue,
      }: {
        jobId: string;
        returnvalue: ChargeReservationJobResult;
      }) => {
        if (jobId !== reservationId) return;
        const event: PaymentEvent = returnvalue.ticket
          ? {
              type: 'confirmed',
              payment: returnvalue.payment,
              ticket: returnvalue.ticket,
            }
          : { type: 'declined', payment: returnvalue.payment };
        subscriber.next({ data: event });
        subscriber.complete();
      };

      const onFailed = ({
        jobId,
        failedReason,
      }: {
        jobId: string;
        failedReason: string;
      }) => {
        if (jobId !== reservationId) return;
        const event: PaymentEvent = { type: 'error', message: failedReason };
        subscriber.next({ data: event });
        subscriber.complete();
      };

      this.queueEvents.on('completed', onCompleted);
      this.queueEvents.on('failed', onFailed);

      return () => {
        this.queueEvents.off('completed', onCompleted);
        this.queueEvents.off('failed', onFailed);
      };
    });
  }
}
```

`returnvalue` on the `completed` event is already deserialized by BullMQ, not a JSON string — confirmed against the installed package's own doc comment (`node_modules/bullmq/dist/esm/classes/queue-events.d.ts`: "`returnvalue` - The value returned by the job's processor, deserialized from JSON."). An earlier draft of this code called `JSON.parse(returnvalue)`, which throws inside the event listener when Redis is actually live — the exception never reaches the `Observable`, so `subscriber.next()`/`.complete()` are never called and the stream hangs until the test's own timeout. Found only once Redis was reachable and the "confirmed"/"declined" tests started really timing out instead of failing on a connection error.

- [ ] **Step 7: Run the spec**

Run: `npm test -- payment-events.stream.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Update the controller**

Replace the contents of `src/modules/payments/payments.controller.ts` with:

```ts
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { ZodResponse } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import type { AuthenticatedUser } from '../../shared/http/auth-request';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { RequestPaymentResponseDto } from './dto/request-payment-response.dto';
import { PaymentEventsStream } from './payment-events.stream';
import { RequestPaymentUseCase } from './use-cases/request-payment.use-case';

@ApiTags('payments')
@Controller('reservations/:reservationId/payment')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth('access_token')
export class PaymentsController {
  constructor(
    private readonly requestPaymentUseCase: RequestPaymentUseCase,
    private readonly paymentEventsStream: PaymentEventsStream,
  ) {}

  @Post()
  @Roles(UserRole.CLIENT)
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Inicia o pagamento assíncrono de uma reserva (processado em fila). Acompanhe o resultado em GET .../events.',
  })
  @ZodResponse({ status: 202, type: RequestPaymentResponseDto })
  async pay(
    @Param('reservationId') reservationId: string,
    @Body() dto: PayReservationDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const result = await this.requestPaymentUseCase.execute({
      reservationId,
      clientId: currentUser.id,
      cardNumber: dto.cardNumber,
    });
    return { reservationId: result.reservationId, status: 'processing' as const };
  }

  @Sse('events')
  @Roles(UserRole.CLIENT)
  @ApiOperation({
    summary:
      'Acompanha o resultado do pagamento em tempo real (Server-Sent Events)',
  })
  async events(
    @Param('reservationId') reservationId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<Observable<MessageEvent>> {
    return this.paymentEventsStream.watch(reservationId, currentUser.id);
  }
}
```

Delete the now-unused response DTO:

```bash
git rm src/modules/payments/dto/payment-response.dto.ts
```

- [ ] **Step 9: Wire the new providers into `PaymentsModule`**

In `src/modules/payments/payments.module.ts`, add imports:

```ts
import { PAYMENT_QUEUE_EVENTS } from './payment-queue-events.token';
import { PaymentQueueEventsProvider } from './payment-queue-events.provider';
import { PaymentEventsStream } from './payment-events.stream';
```

and add to `providers`:

```ts
    { provide: PAYMENT_QUEUE_EVENTS, useClass: PaymentQueueEventsProvider },
    PaymentEventsStream,
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Manually verify the HTTP flow end-to-end**

This repo has no existing e2e/HTTP-level test harness (no `supertest` usage yet despite it being a devDependency), so verify by hand rather than adding a new test pattern:

Run: `docker compose up -d`, `npm run migration:run`, `npm run seed`, then in one terminal `npm run start:dev` and in another `npm run start:worker:dev`. Log in as `cliente1@verzel.com` / `senha123`, create a reservation, `POST /api/reservations/:id/payment` with a card number not ending in `0002` — expect `202 { reservationId, status: 'processing' }`. Open `GET /api/reservations/:id/payment/events` (e.g. `curl -N` with the auth cookie) — expect one `data: {"type":"confirmed",...}` event within a couple seconds.

- [ ] **Step 12: Commit**

```bash
git add -A src/modules/payments/
git commit -m "feat: async 202 payment response with SSE result stream"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update "Configuração local"**

Add a step (after the existing Postgres `docker compose up -d --build` step) documenting that `docker compose up -d` now also starts `redis`, and that `REDIS_URL` must be set in `.env` (already covered by `.env.example`).

- [ ] **Step 2: Update "Pagamentos"**

Rewrite the flow description to reflect: `POST .../payment` now returns `202` immediately after an atomic status transition to `processing`, a worker process (`npm run start:worker:dev`) picks up the job from Redis and calls the gateway, and the client should watch `GET .../payment/events` (SSE) for the outcome. Keep the existing "Concorrência" and "Idempotência e ingresso" subsections but update them to describe the CAS happening *before* the charge (`pending_payment → processing`) rather than only at confirmation, and reference the new `jobId`-based BullMQ dedup as an additional layer. Add a short "Fila de pagamento" subsection naming the residual gap (worker crash between Stripe approval and DB confirm) as a known, documented, un-implemented risk — matching spec section 6.

- [ ] **Step 3: Update "Deploy" (new section, or fold into an existing one if one exists by then)**

Document: needs a Redis instance (`REDIS_URL`) in addition to Postgres; needs a second running process (`start:worker:prod` / `node dist/worker`) alongside the HTTP process (`start:prod`), both pointed at the same `DATABASE_URL`/`REDIS_URL`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document async payment queue, Redis, and worker process"
```

---

## Self-Review Notes

- **Spec coverage:** CAS-before-charge (Task 1–3), queue idempotency via `jobId` (Task 5), retryable vs `UnrecoverableError` classification (Task 6), failed-job revert (Task 6), separate worker process (Task 6–7), SSE (Task 8), webhook reconciliation explicitly excluded (Global Constraints + Task 9 doc note) — all spec sections have a task.
- **Type consistency:** `ChargeReservationOutput` (`{ payment, ticket }`, Task 3) is the literal shape serialized as the BullMQ job return value and deserialized by `PaymentEventsStream` as `ChargeReservationJobResult` (Task 8) — field names match exactly (`payment`, `ticket`) by construction, since Task 8's type was written to mirror Task 3's.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code or an explicit shell command.
