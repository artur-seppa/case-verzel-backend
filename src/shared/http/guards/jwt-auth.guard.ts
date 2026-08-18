import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '../../domain/errors';
import { ACCESS_TOKEN_COOKIE } from '../cookies/auth-cookie.service';
import { AuthenticatedUser, RequestWithUser } from '../auth-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE];

    if (!token) {
      throw new UnauthorizedError('Não autenticado');
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; role: string }>(
        token,
        { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') },
      );
      request.user = {
        id: payload.sub,
        role: payload.role,
      } as AuthenticatedUser;
      return true;
    } catch {
      throw new UnauthorizedError('Sessão inválida ou expirada');
    }
  }
}
