import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Healthcheck da API' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
