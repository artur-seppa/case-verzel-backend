export interface ChargeInput {
  reservationId: string;
  idempotencyKey: string;
  amount: string;
  cardNumber: string;
}

export interface ChargeResult {
  approved: boolean;
}

export interface PaymentGatewayService {
  charge(input: ChargeInput): Promise<ChargeResult>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
