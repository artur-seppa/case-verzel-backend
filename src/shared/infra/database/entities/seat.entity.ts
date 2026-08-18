import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { Seat } from '../../../domain/entities/seat';
import { SeatStatus } from '../../../domain/enums';
import { EventEntity } from './event.entity';
import { ReservationEntity } from './reservation.entity';

@Entity('seats')
@Unique('UQ_seat_event_label', ['eventId', 'label'])
export class SeatEntity implements Seat {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column('varchar', { length: 26 })
  @Index()
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  @Column('varchar', { length: 4 })
  row: string;

  @Column('int')
  number: number;

  @Column('varchar', { length: 8 })
  label: string;

  @Column('enum', { enum: SeatStatus, default: SeatStatus.AVAILABLE })
  status: SeatStatus;

  @Column('varchar', { length: 26, nullable: true })
  reservationId: string | null;

  @ManyToOne(() => ReservationEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reservationId' })
  reservation: ReservationEntity | null;
}
