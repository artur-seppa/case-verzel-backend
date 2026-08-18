import { Inject, Injectable } from '@nestjs/common';
import type { CatalogMovie } from '../../../shared/domain/services/catalog.service';
import { CATALOG_SERVICE } from '../../../shared/domain/services/catalog.service';
import type { CatalogService } from '../../../shared/domain/services/catalog.service';

@Injectable()
export class ListNowPlayingUseCase {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalogService: CatalogService,
  ) {}

  execute(page: number): Promise<CatalogMovie[]> {
    return this.catalogService.listNowPlaying(page);
  }
}
