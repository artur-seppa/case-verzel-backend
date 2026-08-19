import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seat } from '../../../domain/entities/seat';
import { SeatStatus } from '../../../domain/enums';
import { ConflictError, NotFoundError } from '../../../domain/errors';
import {
  CreateSeatInput,
  SeatRepository,
} from '../../../domain/repositories/seat.repository';
import { SeatEntity } from '../entities/seat.entity';

@Injectable()
export class TypeOrmSeatRepository implements SeatRepository {
  constructor(
    @InjectRepository(SeatEntity)
    private readonly repository: Repository<SeatEntity>,
  ) {}

  async createMany(seats: CreateSeatInput[]): Promise<Seat[]> {
    const entities = seats.map((seat) => this.repository.create(seat));
    return this.repository.save(entities);
  }

  findByEventId(eventId: string): Promise<Seat[]> {
    return this.repository.find({
      where: { eventId },
      order: { row: 'ASC', number: 'ASC' },
    });
  }

  findById(id: string): Promise<Seat | null> {
    return this.repository.findOneBy({ id });
  }

  findByReservationId(reservationId: string): Promise<Seat | null> {
    return this.repository.findOneBy({ reservationId });
  }

  countByEventId(eventId: string): Promise<number> {
    return this.repository.countBy({ eventId });
  }

  holdSeat(seatId: string, reservationId: string): Promise<Seat> {
    return this.repository.manager.transaction(async (manager) => {
      const seat = await manager.findOne(SeatEntity, {
        where: { id: seatId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!seat) {
        throw new NotFoundError('Assento', seatId);
      }
      if (seat.status !== SeatStatus.AVAILABLE) {
        throw new ConflictError('Assento não está mais disponível');
      }

      seat.status = SeatStatus.HELD;
      seat.reservationId = reservationId;
      return manager.save(seat);
    });
  }

  async markSold(seatId: string): Promise<Seat> {
    return this.transitionFromHeld(seatId, {
      status: SeatStatus.SOLD,
    });
  }

  async release(seatId: string): Promise<Seat> {
    return this.transitionFromHeld(seatId, {
      status: SeatStatus.AVAILABLE,
      reservationId: null,
    });
  }

  private transitionFromHeld(
    seatId: string,
    changes: Partial<Pick<Seat, 'status' | 'reservationId'>>,
  ): Promise<Seat> {
    return this.repository.manager.transaction(async (manager) => {
      const seat = await manager.findOne(SeatEntity, {
        where: { id: seatId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!seat) {
        throw new NotFoundError('Assento', seatId);
      }
      if (seat.status !== SeatStatus.HELD) {
        throw new ConflictError('Assento não está reservado no momento');
      }

      Object.assign(seat, changes);
      return manager.save(seat);
    });
  }
}
