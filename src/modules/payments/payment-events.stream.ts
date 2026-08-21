import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import type { QueueEvents } from 'bullmq';
import { Observable } from 'rxjs';
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors';
import { RESERVATION_REPOSITORY } from '../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../shared/domain/repositories/reservation.repository';
import type { ChargeReservationJobResult, PaymentEvent } from './payment-event';
import { PAYMENT_QUEUE_EVENTS } from './payment-queue-events.token';
import { jobIdBelongsToReservation } from '../../shared/infra/queue/charge-job-id';

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
        if (!jobIdBelongsToReservation(jobId, reservationId)) return;
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
        if (!jobIdBelongsToReservation(jobId, reservationId)) return;
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
