import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../shared/domain/enums';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { ListMyEventsUseCase } from './list-my-events.use-case';

describe('ListMyEventsUseCase', () => {
  it('only returns events belonging to the organizer, paginated', async () => {
    const { eventRepository } = await buildEventsDependencies();
    const { userRepository } = await buildAuthDependencies();
    const organizer = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.ORGANIZER }),
    );
    const otherOrganizer = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.ORGANIZER }),
    );
    const baseDate = Date.now() + 86_400_000;
    const myEvents = await Promise.all(
      [0, 1, 2].map((i) =>
        eventRepository.create(
          buildCreateEventInput(organizer.id, {
            date: new Date(baseDate + i * 3_600_000),
          }),
        ),
      ),
    );
    await eventRepository.create(buildCreateEventInput(otherOrganizer.id));
    const useCase = new ListMyEventsUseCase(eventRepository);

    const page1 = await useCase.execute(organizer.id, { page: 1, limit: 2 });
    const page2 = await useCase.execute(organizer.id, { page: 2, limit: 2 });

    expect(page1.total).toBe(3);
    expect(page1.items.map((e) => e.id)).toEqual([
      myEvents[0].id,
      myEvents[1].id,
    ]);
    expect(page2.items.map((e) => e.id)).toEqual([myEvents[2].id]);
  });
});
