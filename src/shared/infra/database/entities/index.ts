import { UserEntity } from './user.entity';
import { EventEntity } from './event.entity';
import { SeatEntity } from './seat.entity';
import { ReservationEntity } from './reservation.entity';
import { PaymentEntity } from './payment.entity';
import { TicketEntity } from './ticket.entity';
import { RefreshTokenEntity } from './refresh-token.entity';

export * from './user.entity';
export * from './event.entity';
export * from './seat.entity';
export * from './reservation.entity';
export * from './payment.entity';
export * from './ticket.entity';
export * from './refresh-token.entity';

export const entities = [
  UserEntity,
  EventEntity,
  SeatEntity,
  ReservationEntity,
  PaymentEntity,
  TicketEntity,
  RefreshTokenEntity,
];
