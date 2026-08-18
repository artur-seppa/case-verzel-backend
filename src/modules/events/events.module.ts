import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from '../../shared/infra/database/entities/event.entity';
import { SeatEntity } from '../../shared/infra/database/entities/seat.entity';
import { EVENT_REPOSITORY } from '../../shared/domain/repositories/event.repository';
import { SEAT_REPOSITORY } from '../../shared/domain/repositories/seat.repository';
import { TypeOrmEventRepository } from '../../shared/infra/database/repositories/typeorm-event.repository';
import { TypeOrmSeatRepository } from '../../shared/infra/database/repositories/typeorm-seat.repository';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsController } from './events.controller';
import { CreateEventUseCase } from './use-cases/create-event.use-case';
import { GetEventUseCase } from './use-cases/get-event.use-case';
import { ListEventsUseCase } from './use-cases/list-events.use-case';
import { ListMyEventsUseCase } from './use-cases/list-my-events.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity, SeatEntity]), CatalogModule],
  controllers: [EventsController],
  providers: [
    { provide: EVENT_REPOSITORY, useClass: TypeOrmEventRepository },
    { provide: SEAT_REPOSITORY, useClass: TypeOrmSeatRepository },
    CreateEventUseCase,
    ListEventsUseCase,
    ListMyEventsUseCase,
    GetEventUseCase,
  ],
  exports: [EVENT_REPOSITORY, SEAT_REPOSITORY],
})
export class EventsModule {}
