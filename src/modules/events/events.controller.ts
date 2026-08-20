import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CreateEventDto } from './dto/create-event.dto';
import {
  EventDetailResponseDto,
  toEventDetailResponse,
} from './dto/event-detail-response.dto';
import {
  EventResponseDto,
  PaginatedEventsResponseDto,
  toEventResponse,
} from './dto/event-response.dto';
import { CreateEventUseCase } from './use-cases/create-event.use-case';
import { GetEventUseCase } from './use-cases/get-event.use-case';
import { ListEventsUseCase } from './use-cases/list-events.use-case';
import { ListMyEventsUseCase } from './use-cases/list-my-events.use-case';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly createEventUseCase: CreateEventUseCase,
    private readonly listEventsUseCase: ListEventsUseCase,
    private readonly listMyEventsUseCase: ListMyEventsUseCase,
    private readonly getEventUseCase: GetEventUseCase,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Cria um evento a partir de um filme do catálogo (organizador)',
  })
  @ZodResponse({ status: 201, type: EventResponseDto })
  async create(
    @Body() dto: CreateEventDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const event = await this.createEventUseCase.execute({
      ...dto,
      date: new Date(dto.date),
      organizerId: currentUser.id,
    });
    return toEventResponse(event);
  }

  @Get()
  @ApiOperation({ summary: 'Lista os eventos publicados' })
  @ZodResponse({ status: 200, type: PaginatedEventsResponseDto })
  async list(@Query() { page, limit }: PaginationQueryDto) {
    const result = await this.listEventsUseCase.execute({ page, limit });
    return toPaginatedResponse(
      { items: result.items.map(toEventResponse), total: result.total },
      page,
      limit,
    );
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Lista os eventos do organizador autenticado' })
  @ZodResponse({ status: 200, type: PaginatedEventsResponseDto })
  async listMine(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() { page, limit }: PaginationQueryDto,
  ) {
    const result = await this.listMyEventsUseCase.execute(currentUser.id, {
      page,
      limit,
    });
    return toPaginatedResponse(
      { items: result.items.map(toEventResponse), total: result.total },
      page,
      limit,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do evento, incluindo o mapa de assentos' })
  @ZodResponse({ status: 200, type: EventDetailResponseDto })
  async getById(@Param('id') id: string) {
    const event = await this.getEventUseCase.execute(id);
    return toEventDetailResponse(event);
  }
}
