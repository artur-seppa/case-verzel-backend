import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Payment } from '../../../domain/entities/payment';
import { PaymentStatus } from '../../../domain/enums';
import { ReservationEntity } from './reservation.entity';

@Entity('payments')
export class PaymentEntity implements Payment {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column('varchar', { length: 26 })
  reservationId: string;

  @ManyToOne(() => ReservationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reservationId' })
  reservation: ReservationEntity;

  @Column('enum', { enum: PaymentStatus })
  status: PaymentStatus;

  @Column('numeric', { precision: 10, scale: 2 })
  amount: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
