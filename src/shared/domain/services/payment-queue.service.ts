export interface EnqueueChargeInput {
  reservationId: string;
  cardNumber: string;
}

export interface PaymentQueueService {
  enqueueCharge(input: EnqueueChargeInput): Promise<void>;
}

export const PAYMENT_QUEUE = Symbol('PAYMENT_QUEUE');
