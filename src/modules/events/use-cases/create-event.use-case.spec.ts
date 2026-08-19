import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { FakeCatalogService } from '../../../../test/support/fake-catalog-service';
import { buildCatalogMovie } from '../../../../test/factories/catalog-movie.factory';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { UserRole } from '../../../shared/domain/enums';
import { CreateEventUseCase } from './create-event.use-case';

describe('CreateEventUseCase', () => {
  let organizerId: string;
  let deps: Awaited<ReturnType<typeof buildEventsDependencies>>;

  beforeEach(async () => {
    const { userRepository } = await buildAuthDependencies();
    const organizer = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.ORGANIZER }),
    );
    organizerId = organizer.id;
    deps = await buildEventsDependencies();
  });

  it('creates an event from the catalog and generates seats for its capacity', async () => {
    const catalogService = new FakeCatalogService([
      buildCatalogMovie({ tmdbId: '969681', title: 'Homem-Aranha' }),
    ]);
    const useCase = new CreateEventUseCase(
      catalogService,
      deps.eventRepository,
      deps.seatRepository,
    );

    const event = await useCase.execute({
      organizerId,
      tmdbId: '969681',
      date: new Date(Date.now() + 86_400_000),
      location: 'Cinema Verzel',
      capacity: 24,
      price: '39.90',
    });

    expect(event.title).toBe('Homem-Aranha');
    expect(event.organizerId).toBe(organizerId);

    const seats = await deps.seatRepository.findByEventId(event.id);
    expect(seats).toHaveLength(24);
  });

  it('rejects a tmdbId that does not exist in the catalog', async () => {
    const catalogService = new FakeCatalogService([]);
    const useCase = new CreateEventUseCase(
      catalogService,
      deps.eventRepository,
      deps.seatRepository,
    );

    await expect(
      useCase.execute({
        organizerId,
        tmdbId: 'inexistente',
        date: new Date(Date.now() + 86_400_000),
        location: 'Cinema Verzel',
        capacity: 10,
        price: '10.00',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
