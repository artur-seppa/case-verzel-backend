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
        error instanceof Error ? error.message : 'Falha ao processar pagamento',
      );
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ChargeReservationInput> | undefined): Promise<void> {
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
