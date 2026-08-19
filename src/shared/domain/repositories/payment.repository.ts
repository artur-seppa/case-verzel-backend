import { Payment } from '../entities/payment';
import { PaymentStatus } from '../enums';

export interface CreatePaymentInput {
  id: string;
  reservationId: string;
  status: PaymentStatus;
  amount: string;
}

export interface PaymentRepository {
  create(input: CreatePaymentInput): Promise<Payment>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
