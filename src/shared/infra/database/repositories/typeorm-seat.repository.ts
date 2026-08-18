import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seat } from '../../../domain/entities/seat';
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

  countByEventId(eventId: string): Promise<number> {
    return this.repository.countBy({ eventId });
  }
}
