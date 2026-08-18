import { PaymentStatus } from '../enums';

export interface Payment {
  id: string;
  reservationId: string;
  status: PaymentStatus;
  amount: string;
  createdAt: Date;
}
