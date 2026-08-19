import { faker } from '@faker-js/faker';
import { ulid } from 'ulid';
import { CreateEventInput } from '../../src/shared/domain/repositories/event.repository';

export function buildCreateEventInput(
  organizerId: string,
  overrides: Partial<Omit<CreateEventInput, 'organizerId'>> = {},
): CreateEventInput {
  return {
    id: ulid(),
    organizerId,
    title: faker.lorem.words(3),
    synopsis: faker.lorem.sentence(),
    posterUrl: null,
    tmdbId: faker.number.int({ min: 1, max: 999_999 }).toString(),
    date: faker.date.soon({ days: 30 }),
    location: faker.location.streetAddress(),
    capacity: 10,
    price: '10.00',
    ...overrides,
  };
}
