import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { ZodResponse } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import type { AuthenticatedUser } from '../../shared/http/auth-request';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { RequestPaymentResponseDto } from './dto/request-payment-response.dto';
import { PaymentEventsStream } from './payment-events.stream';
import { RequestPaymentUseCase } from './use-cases/request-payment.use-case';

@ApiTags('payments')
@Controller('reservations/:reservationId/payment')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth('access_token')
export class PaymentsController {
  constructor(
    private readonly requestPaymentUseCase: RequestPaymentUseCase,
    private readonly paymentEventsStream: PaymentEventsStream,
  ) {}

  @Post()
  @Roles(UserRole.CLIENT)
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Inicia o pagamento assíncrono de uma reserva (processado em fila). Acompanhe o resultado em GET .../events.',
    description:
      'O número do cartão 4000000000000002 (exato, não só terminando em 0002) é sempre recusado — mesma convenção dos cartões de teste do Stripe. Qualquer outro número de 13 a 19 dígitos aprova.',
  })
  @ZodResponse({ status: 202, type: RequestPaymentResponseDto })
  async pay(
    @Param('reservationId') reservationId: string,
    @Body() dto: PayReservationDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const result = await this.requestPaymentUseCase.execute({
      reservationId,
      clientId: currentUser.id,
      cardNumber: dto.cardNumber,
    });
    return { reservationId: result.reservationId, status: 'processing' as const };
  }

  @Sse('events')
  @Roles(UserRole.CLIENT)
  @ApiOperation({
    summary:
      'Acompanha o resultado do pagamento em tempo real (Server-Sent Events)',
  })
  async events(
    @Param('reservationId') reservationId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<Observable<MessageEvent>> {
    return this.paymentEventsStream.watch(reservationId, currentUser.id);
  }
}
