import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { CatalogMovieResponseDto } from './dto/catalog-movie-response.dto';
import { ListNowPlayingUseCase } from './use-cases/list-now-playing.use-case';

@ApiTags('catalog')
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly listNowPlayingUseCase: ListNowPlayingUseCase) {}

  @Get('movies')
  @Roles(UserRole.ORGANIZER)
  @ZodSerializerDto([CatalogMovieResponseDto])
  listMovies(@Query('page') page?: string) {
    return this.listNowPlayingUseCase.execute(page ? Number(page) : 1);
  }
}
