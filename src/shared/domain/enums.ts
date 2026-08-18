export enum UserRole {
  ORGANIZER = 'organizer',
  CLIENT = 'client',
  GATEKEEPER = 'gatekeeper',
}

export enum SeatStatus {
  AVAILABLE = 'available',
  HELD = 'held',
  SOLD = 'sold',
}

export enum ReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  DECLINED = 'declined',
}

export enum PaymentStatus {
  APPROVED = 'approved',
  DECLINED = 'declined',
}

export enum TicketStatus {
  VALID = 'valid',
  USED = 'used',
}
