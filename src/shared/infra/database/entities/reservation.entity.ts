import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Reservation } from '../../../domain/entities/reservation';
import { ReservationStatus } from '../../../domain/enums';
import { EventEntity } from './event.entity';
import { UserEntity } from './user.entity';

@Entity('reservations')
export class ReservationEntity implements Reservation {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column('varchar', { length: 26 })
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  @Column('varchar', { length: 26 })
  clientId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: UserEntity;

  @Column('enum', { enum: ReservationStatus })
  status: ReservationStatus;

  @Column('timestamptz')
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
