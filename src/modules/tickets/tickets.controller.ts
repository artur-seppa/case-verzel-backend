import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import type { AuthenticatedUser } from '../../shared/http/auth-request';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import {
  PaginationQueryDto,
  toPaginatedResponse,
} from '../../shared/http/dto/pagination.dto';
import {
  PaginatedTicketsResponseDto,
  TicketDetailResponseDto,
  toTicketDetailResponse,
} from './dto/ticket-detail-response.dto';
import { GetSharedTicketUseCase } from './use-cases/get-shared-ticket.use-case';
import { GetTicketByIdUseCase } from './use-cases/get-ticket-by-id.use-case';
import { ListMyTicketsUseCase } from './use-cases/list-my-tickets.use-case';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly getSharedTicketUseCase: GetSharedTicketUseCase,
    private readonly listMyTicketsUseCase: ListMyTicketsUseCase,
    private readonly getTicketByIdUseCase: GetTicketByIdUseCase,
  ) {}

  @Get('shared/:shareToken')
  @ApiOperation({
    summary:
      'Consulta um ingresso pelo link de compartilhamento — sem autenticação, o link é o que autoriza o acesso',
  })
  @ZodResponse({ status: 200, type: TicketDetailResponseDto })
  async getShared(@Param('shareToken') shareToken: string) {
    const result = await this.getSharedTicketUseCase.execute({ shareToken });
    return toTicketDetailResponse(result);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Lista os ingressos do cliente autenticado' })
  @ZodResponse({ status: 200, type: PaginatedTicketsResponseDto })
  async listMine(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    const result = await this.listMyTicketsUseCase.execute(currentUser.id, {
      page,
      limit,
    });
    return toPaginatedResponse(
      { items: result.items.map(toTicketDetailResponse), total: result.total },
      page,
      limit,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Detalhe de um ingresso do cliente autenticado' })
  @ZodResponse({ status: 200, type: TicketDetailResponseDto })
  async getById(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const result = await this.getTicketByIdUseCase.execute({
      ticketId: id,
      clientId: currentUser.id,
    });
    return toTicketDetailResponse(result);
  }
}
