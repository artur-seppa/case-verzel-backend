import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
  ReservationDetailResponseDto,
  ReservationResponseDto,
  toReservationDetailResponse,
  toReservationResponse,
} from './dto/reservation-response.dto';
import { CreateReservationUseCase } from './use-cases/create-reservation.use-case';
import { GetReservationByIdUseCase } from './use-cases/get-reservation-by-id.use-case';

@ApiTags('reservations')
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth('access_token')
export class ReservationsController {
  constructor(
    private readonly createReservationUseCase: CreateReservationUseCase,
    private readonly getReservationByIdUseCase: GetReservationByIdUseCase,
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

  @Get(':id')
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Detalhe de uma reserva do cliente autenticado' })
  @ZodResponse({ status: 200, type: ReservationDetailResponseDto })
  async getById(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const reservation = await this.getReservationByIdUseCase.execute({
      reservationId: id,
      clientId: currentUser.id,
    });
    return toReservationDetailResponse(reservation);
  }
}
