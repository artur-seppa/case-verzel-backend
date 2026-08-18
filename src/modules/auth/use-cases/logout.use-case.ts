import { Injectable } from '@nestjs/common';
import { TokenService } from '../token.service';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly tokenService: TokenService) {}

  async execute(refreshToken: string): Promise<void> {
    const stored = await this.tokenService.findValidRefreshToken(refreshToken);
    if (stored) {
      await this.tokenService.revokeRefreshToken(stored.id);
    }
  }
}
