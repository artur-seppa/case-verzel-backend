import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { ValidateTicketDto } from './dto/validate-ticket.dto';
import {
  ValidateTicketResponseDto,
  toValidateTicketResponse,
} from './dto/validate-ticket-response.dto';
import { ValidateTicketUseCase } from './use-cases/validate-ticket.use-case';

@ApiTags('gatekeeper')
@Controller('gatekeeper/validate')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth('access_token')
export class GatekeeperController {
  constructor(private readonly validateTicketUseCase: ValidateTicketUseCase) {}

  @Post()
  @Roles(UserRole.GATEKEEPER)
  @ApiOperation({
    summary:
      'Valida um ingresso na portaria a partir do QR code escaneado. Um ingresso só pode ser validado uma vez.',
  })
  @ZodResponse({ status: 200, type: ValidateTicketResponseDto })
  async validate(@Body() dto: ValidateTicketDto) {
    const result = await this.validateTicketUseCase.execute({
      qrToken: dto.qrToken,
    });
    return toValidateTicketResponse(result);
  }
}
