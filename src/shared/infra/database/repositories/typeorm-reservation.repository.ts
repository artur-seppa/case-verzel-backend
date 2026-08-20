import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reservation } from '../../../domain/entities/reservation';
import { ReservationStatus, SeatStatus } from '../../../domain/enums';
import { ConflictError, NotFoundError } from '../../../domain/errors';
import {
  CreateReservationInput,
  ReservationRepository,
} from '../../../domain/repositories/reservation.repository';
import { ReservationEntity } from '../entities/reservation.entity';
import { SeatEntity } from '../entities/seat.entity';

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

  async createWithSeatHold(
    input: CreateReservationInput,
    seatId: string,
  ): Promise<Reservation> {
    return this.repository.manager.transaction(async (manager) => {
      const seat = await manager.findOne(SeatEntity, {
        where: { id: seatId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!seat || seat.eventId !== input.eventId) {
        throw new NotFoundError('Assento', seatId);
      }
      if (seat.status !== SeatStatus.AVAILABLE) {
        throw new ConflictError('Assento não está mais disponível');
      }

      const reservation = await manager.save(
        manager.create(ReservationEntity, input),
      );

      seat.status = SeatStatus.HELD;
      seat.reservationId = reservation.id;
      await manager.save(seat);

      return reservation;
    });
  }

  findById(id: string): Promise<Reservation | null> {
    return this.repository.findOneBy({ id });
  }

  async updateStatus(id: string, status: ReservationStatus): Promise<void> {
    await this.repository.update({ id }, { status });
  }

  async startProcessingIfPending(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.PROCESSING,
    );
  }

  async confirmIfProcessing(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PROCESSING,
      ReservationStatus.CONFIRMED,
    );
  }

  async revertToPendingIfProcessing(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PROCESSING,
      ReservationStatus.PENDING_PAYMENT,
    );
  }

  async cancelIfPending(id: string): Promise<boolean> {
    return this.transition(
      id,
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.CANCELLED,
    );
  }

  private async transition(
    id: string,
    from: ReservationStatus,
    to: ReservationStatus,
  ): Promise<boolean> {
    const result = await this.repository.update(
      { id, status: from },
      { status: to },
    );
    return (result.affected ?? 0) > 0;
  }
}
