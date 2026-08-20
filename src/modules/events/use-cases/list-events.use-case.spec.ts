import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../shared/domain/enums';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { ListEventsUseCase } from './list-events.use-case';

describe('ListEventsUseCase', () => {
  it('returns an empty page when there are no events', async () => {
    const { eventRepository } = await buildEventsDependencies();
    const useCase = new ListEventsUseCase(eventRepository);

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('paginates events ordered by date', async () => {
    const { eventRepository } = await buildEventsDependencies();
    const { userRepository } = await buildAuthDependencies();
    const organizer = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.ORGANIZER }),
    );
    const baseDate = Date.now() + 86_400_000;
    const events = await Promise.all(
      [0, 1, 2].map((i) =>
        eventRepository.create(
          buildCreateEventInput(organizer.id, {
            date: new Date(baseDate + i * 3_600_000),
          }),
        ),
      ),
    );
    const useCase = new ListEventsUseCase(eventRepository);

    const page1 = await useCase.execute({ page: 1, limit: 2 });
    const page2 = await useCase.execute({ page: 2, limit: 2 });

    expect(page1.total).toBe(3);
    expect(page1.items.map((e) => e.id)).toEqual([events[0].id, events[1].id]);
    expect(page2.items.map((e) => e.id)).toEqual([events[2].id]);
  });
});
