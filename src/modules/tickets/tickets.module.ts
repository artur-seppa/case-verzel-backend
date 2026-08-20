import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketEntity } from '../../shared/infra/database/entities/ticket.entity';
import { TICKET_REPOSITORY } from '../../shared/domain/repositories/ticket.repository';
import { TypeOrmTicketRepository } from '../../shared/infra/database/repositories/typeorm-ticket.repository';
import { EventsModule } from '../events/events.module';
import { TicketsController } from './tickets.controller';
import { GetSharedTicketUseCase } from './use-cases/get-shared-ticket.use-case';
import { GetTicketByIdUseCase } from './use-cases/get-ticket-by-id.use-case';
import { ListMyTicketsUseCase } from './use-cases/list-my-tickets.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([TicketEntity]), EventsModule],
  controllers: [TicketsController],
  providers: [
    { provide: TICKET_REPOSITORY, useClass: TypeOrmTicketRepository },
    GetSharedTicketUseCase,
    ListMyTicketsUseCase,
    GetTicketByIdUseCase,
  ],
  exports: [TICKET_REPOSITORY],
})
export class TicketsModule {}
