import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QR_SECRET } from '../../shared/utils/qr-token';
import { TicketsModule } from '../tickets/tickets.module';
import { GatekeeperController } from './gatekeeper.controller';
import { ValidateTicketUseCase } from './use-cases/validate-ticket.use-case';

@Module({
  imports: [TicketsModule],
  controllers: [GatekeeperController],
  providers: [
    {
      provide: QR_SECRET,
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>('TICKET_QR_SECRET'),
      inject: [ConfigService],
    },
    ValidateTicketUseCase,
  ],
})
export class GatekeeperModule {}
