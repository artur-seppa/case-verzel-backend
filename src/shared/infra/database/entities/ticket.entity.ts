import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { Ticket } from '../../../domain/entities/ticket';
import { TicketStatus } from '../../../domain/enums';
import { EventEntity } from './event.entity';
import { ReservationEntity } from './reservation.entity';
import { SeatEntity } from './seat.entity';
import { UserEntity } from './user.entity';

@Entity('tickets')
export class TicketEntity implements Ticket {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column('varchar', { length: 26 })
  reservationId: string;

  @ManyToOne(() => ReservationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reservationId' })
  reservation: ReservationEntity;

  @Column('varchar', { length: 26 })
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  @Column('varchar', { length: 26, unique: true })
  seatId: string;

  @OneToOne(() => SeatEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seatId' })
  seat: SeatEntity;

  @Column('varchar', { length: 26 })
  clientId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: UserEntity;

  @Column('text', { unique: true })
  qrToken: string;

  @Column('varchar', { length: 32, unique: true })
  shareToken: string;

  @Column('enum', { enum: TicketStatus, default: TicketStatus.VALID })
  status: TicketStatus;

  @Column('timestamptz', { nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
