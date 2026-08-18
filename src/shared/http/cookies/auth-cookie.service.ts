import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { parseDurationToSeconds } from '../../utils/parse-duration';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService) {}

  private get isProduction(): boolean {
    return this.config.get('NODE_ENV') === 'production';
  }

  set(reply: FastifyReply, accessToken: string, refreshToken: string): void {
    const base = {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: this.isProduction ? ('none' as const) : ('lax' as const),
      path: '/',
    };

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...base,
      maxAge: parseDurationToSeconds(
        this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
      ),
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...base,
      maxAge: parseDurationToSeconds(
        this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
      ),
    });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  }
}
