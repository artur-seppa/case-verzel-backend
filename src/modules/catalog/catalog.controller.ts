import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { UserRole } from '../../shared/domain/enums';
import { Roles } from '../../shared/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/guards/roles.guard';
import { PageQueryDto } from '../../shared/http/dto/pagination.dto';
import { PaginatedCatalogMoviesResponseDto } from './dto/catalog-movie-response.dto';
import { ListNowPlayingUseCase } from './use-cases/list-now-playing.use-case';

@ApiTags('catalog')
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiCookieAuth('access_token')
export class CatalogController {
  constructor(private readonly listNowPlayingUseCase: ListNowPlayingUseCase) {}

  @Get('movies')
  @Roles(UserRole.ORGANIZER)
  @ApiOperation({
    summary: 'Filmes em cartaz na TMDb, pro organizador escolher',
  })
  @ZodResponse({ status: 200, type: PaginatedCatalogMoviesResponseDto })
  async listMovies(@Query() { page }: PageQueryDto) {
    const result = await this.listNowPlayingUseCase.execute(page);
    return {
      data: result.items,
      meta: {
        page: result.page,
        limit: result.items.length,
        total: result.totalResults,
        totalPages: result.totalPages,
      },
    };
  }
}
