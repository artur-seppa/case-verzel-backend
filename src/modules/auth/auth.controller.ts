import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ZodSerializerDto } from 'nestjs-zod';
import type {
  AuthenticatedUser,
  RequestWithUser,
} from '../../shared/http/auth-request';
import {
  AuthCookieService,
  REFRESH_TOKEN_COOKIE,
} from '../../shared/http/cookies/auth-cookie.service';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator';
import { UnauthorizedError } from '../../shared/domain/errors';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { GetCurrentUserUseCase } from './use-cases/get-current-user.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshSessionUseCase } from './use-cases/refresh-session.use-case';
import { RegisterUseCase } from './use-cases/register.use-case';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly authCookieService: AuthCookieService,
  ) {}

  @Post('register')
  @ZodSerializerDto(UserResponseDto)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { user, tokens } = await this.registerUseCase.execute(dto);
    this.authCookieService.set(reply, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  @ZodSerializerDto(UserResponseDto)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { user, tokens } = await this.loginUseCase.execute(dto);
    this.authCookieService.set(reply, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  @Post('refresh')
  @HttpCode(200)
  @ZodSerializerDto(UserResponseDto)
  async refresh(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedError('Sessão expirada, faça login novamente');
    }

    const { user, tokens } =
      await this.refreshSessionUseCase.execute(refreshToken);
    this.authCookieService.set(reply, tokens.accessToken, tokens.refreshToken);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await this.logoutUseCase.execute(refreshToken);
    }
    this.authCookieService.clear(reply);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ZodSerializerDto(UserResponseDto)
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.getCurrentUserUseCase.execute(currentUser.id);
  }
}
