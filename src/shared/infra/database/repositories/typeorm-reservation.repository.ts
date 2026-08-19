import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reservation } from '../../../domain/entities/reservation';
import { ReservationStatus } from '../../../domain/enums';
import {
  CreateReservationInput,
  ReservationRepository,
} from '../../../domain/repositories/reservation.repository';
import { ReservationEntity } from '../entities/reservation.entity';

@Injectable()
export class TypeOrmReservationRepository implements ReservationRepository {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly repository: Repository<ReservationEntity>,
  ) {}

  async create(input: CreateReservationInput): Promise<Reservation> {
    const entity = this.repository.create(input);
    return this.repository.save(entity);
  }

  findById(id: string): Promise<Reservation | null> {
    return this.repository.findOneBy({ id });
  }

  async updateStatus(id: string, status: ReservationStatus): Promise<void> {
    await this.repository.update({ id }, { status });
  }
}
