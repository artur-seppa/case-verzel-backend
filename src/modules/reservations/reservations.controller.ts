import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import type { AuthenticatedUser } from '../../shared/http/auth-request';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { CreateReservationDto } from './dto/create-reservation.dto';
import {
  ReservationResponseDto,
  toReservationResponse,
} from './dto/reservation-response.dto';
import { CreateReservationUseCase } from './use-cases/create-reservation.use-case';

@ApiTags('reservations')
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth('access_token')
export class ReservationsController {
  constructor(
    private readonly createReservationUseCase: CreateReservationUseCase,
  ) {}

  @Post()
  @Roles(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Reserva um assento (segura o lugar até o pagamento)',
  })
  @ZodResponse({ status: 201, type: ReservationResponseDto })
  async create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const reservation = await this.createReservationUseCase.execute({
      ...dto,
      clientId: currentUser.id,
    });
    return toReservationResponse(reservation);
  }
}
