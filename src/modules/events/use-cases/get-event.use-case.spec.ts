import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../shared/domain/errors';
import { UserRole } from '../../../shared/domain/enums';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import {
  buildCatalogMovie,
  FakeCatalogService,
} from '../../../../test/support/fake-catalog-service';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { CreateEventUseCase } from './create-event.use-case';
import { GetEventUseCase } from './get-event.use-case';

describe('GetEventUseCase', () => {
  let deps: Awaited<ReturnType<typeof buildEventsDependencies>>;
  let useCase: GetEventUseCase;

  beforeEach(async () => {
    deps = await buildEventsDependencies();
    useCase = new GetEventUseCase(deps.eventRepository, deps.seatRepository);
  });

  it('throws NotFoundError for an event that does not exist', async () => {
    await expect(useCase.execute('does-not-exist')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('returns the event with its generated seats', async () => {
    const { userRepository } = await buildAuthDependencies();
    const organizer = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.ORGANIZER }),
    );

    const catalogService = new FakeCatalogService([buildCatalogMovie()]);
    const createEventUseCase = new CreateEventUseCase(
      catalogService,
      deps.eventRepository,
      deps.seatRepository,
    );
    const created = await createEventUseCase.execute({
      organizerId: organizer.id,
      tmdbId: '969681',
      date: new Date(Date.now() + 86_400_000),
      location: 'Cinema Verzel',
      capacity: 12,
      price: '25.00',
    });

    const result = await useCase.execute(created.id);

    expect(result.id).toBe(created.id);
    expect(result.seats).toHaveLength(12);
  });
});
