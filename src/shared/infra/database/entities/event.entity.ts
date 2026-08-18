import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Event } from '../../../domain/entities/event';
import { UserEntity } from './user.entity';

@Entity('events')
export class EventEntity implements Event {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column('varchar', { length: 26 })
  organizerId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizerId' })
  organizer: UserEntity;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('text', { nullable: true })
  synopsis: string | null;

  @Column('text', { nullable: true })
  posterUrl: string | null;

  @Column('varchar', { length: 32 })
  tmdbId: string;

  @Column('timestamptz')
  date: Date;

  @Column('varchar', { length: 255 })
  location: string;

  @Column('int')
  capacity: number;

  @Column('numeric', { precision: 10, scale: 2 })
  price: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
