import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationEntity } from '../../shared/infra/database/entities/reservation.entity';
import { RESERVATION_REPOSITORY } from '../../shared/domain/repositories/reservation.repository';
import { TypeOrmReservationRepository } from '../../shared/infra/database/repositories/typeorm-reservation.repository';
import { EventsModule } from '../events/events.module';
import { ReservationsController } from './reservations.controller';
import { CreateReservationUseCase } from './use-cases/create-reservation.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([ReservationEntity]), EventsModule],
  controllers: [ReservationsController],
  providers: [
    { provide: RESERVATION_REPOSITORY, useClass: TypeOrmReservationRepository },
    CreateReservationUseCase,
  ],
  exports: [RESERVATION_REPOSITORY],
})
export class ReservationsModule {}
