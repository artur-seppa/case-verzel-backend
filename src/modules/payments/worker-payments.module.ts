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
