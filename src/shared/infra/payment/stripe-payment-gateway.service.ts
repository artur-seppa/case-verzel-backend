import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import type {
  ChargeInput,
  ChargeResult,
  PaymentGatewayService,
} from '../../domain/services/payment-gateway.service';

const DECLINE_CARD_NUMBER = '4000000000000002';
const DECLINE_TEST_PAYMENT_METHOD = 'pm_card_chargeDeclined';
const APPROVE_TEST_PAYMENT_METHOD = 'pm_card_visa';

function isCardError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'StripeCardError'
  );
}

@Injectable()
export class StripePaymentGatewayService implements PaymentGatewayService {
  constructor(private readonly stripe: Stripe) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const paymentMethod =
      input.cardNumber === DECLINE_CARD_NUMBER
        ? DECLINE_TEST_PAYMENT_METHOD
        : APPROVE_TEST_PAYMENT_METHOD;

    try {
      await this.stripe.paymentIntents.create(
        {
          amount: Math.round(Number(input.amount) * 100),
          currency: 'brl',
          payment_method: paymentMethod,
          confirm: true,
          off_session: true,
          description: `Reserva ${input.reservationId}`,
        },
        { idempotencyKey: input.reservationId },
      );
      return { approved: true };
    } catch (error) {
      if (isCardError(error)) {
        return { approved: false };
      }
      throw error;
    }
  }
}
