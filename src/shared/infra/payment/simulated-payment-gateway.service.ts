import { Injectable } from '@nestjs/common';
import type {
  ChargeInput,
  ChargeResult,
  PaymentGatewayService,
} from '../../domain/services/payment-gateway.service';

const DECLINE_CARD_NUMBER = '4000000000000002';

@Injectable()
export class SimulatedPaymentGatewayService implements PaymentGatewayService {
  charge(input: ChargeInput): Promise<ChargeResult> {
    return Promise.resolve({
      approved: input.cardNumber !== DECLINE_CARD_NUMBER,
    });
  }
}
