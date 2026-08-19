interface PaymentEventPayment {
  id: string;
  reservationId: string;
  status: string;
  amount: string;
  createdAt: string;
}

interface PaymentEventTicket {
  id: string;
  qrToken: string;
  shareToken: string;
  status: string;
  createdAt: string;
}

export interface ChargeReservationJobResult {
  payment: PaymentEventPayment;
  ticket: PaymentEventTicket | null;
}

export type PaymentEvent =
  | { type: 'confirmed'; payment: PaymentEventPayment; ticket: PaymentEventTicket }
  | { type: 'declined'; payment: PaymentEventPayment }
  | { type: 'error'; message: string };
