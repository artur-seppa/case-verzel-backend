import { Module } from '@nestjs/common';
import { CATALOG_SERVICE } from '../../shared/domain/services/catalog.service';
import { TmdbCatalogService } from '../../shared/infra/catalog/tmdb-catalog.service';
import { CatalogController } from './catalog.controller';
import { ListNowPlayingUseCase } from './use-cases/list-now-playing.use-case';

@Module({
  controllers: [CatalogController],
  providers: [
    { provide: CATALOG_SERVICE, useClass: TmdbCatalogService },
    ListNowPlayingUseCase,
  ],
  exports: [CATALOG_SERVICE],
})
export class CatalogModule {}
