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
import { PAYMENT_QUEUE_EVENTS } from './payment-queue-events.token';
import { PaymentQueueEventsProvider } from './payment-queue-events.provider';
import { PaymentEventsStream } from './payment-events.stream';
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
    { provide: PAYMENT_QUEUE_EVENTS, useClass: PaymentQueueEventsProvider },
    PaymentEventsStream,
  ],
})
export class PaymentsModule {}
