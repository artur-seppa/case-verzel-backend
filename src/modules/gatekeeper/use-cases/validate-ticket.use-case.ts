import { Inject, Injectable } from '@nestjs/common';
import type { Event } from '../../../shared/domain/entities/event';
import type { Seat } from '../../../shared/domain/entities/seat';
import type { Ticket } from '../../../shared/domain/entities/ticket';
import { UnauthorizedError } from '../../../shared/domain/errors';
import { TICKET_REPOSITORY } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketRepository } from '../../../shared/domain/repositories/ticket.repository';
import { QR_SECRET, verifyQrToken } from '../../../shared/utils/qr-token';

export interface ValidateTicketInput {
  qrToken: string;
}

export interface ValidateTicketOutput {
  ticket: Ticket;
  event: Event;
  seat: Seat;
}

@Injectable()
export class ValidateTicketUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY)
    private readonly ticketRepository: TicketRepository,
    @Inject(QR_SECRET) private readonly qrSecret: string,
  ) {}

  async execute(input: ValidateTicketInput): Promise<ValidateTicketOutput> {
    const ticketId = verifyQrToken(input.qrToken, this.qrSecret);
    if (!ticketId) {
      throw new UnauthorizedError('QR code inválido');
    }

    return this.ticketRepository.validate(ticketId);
  }
}
