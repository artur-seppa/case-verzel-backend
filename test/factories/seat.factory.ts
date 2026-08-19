import { ulid } from 'ulid';
import { CreateSeatInput } from '../../src/shared/domain/repositories/seat.repository';

export function buildCreateSeatInput(
  eventId: string,
  overrides: Partial<Omit<CreateSeatInput, 'eventId' | 'label'>> = {},
): CreateSeatInput {
  const row = overrides.row ?? 'A';
  const number = overrides.number ?? 1;

  return {
    id: ulid(),
    eventId,
    row,
    number,
    label: `${row}${number}`,
    ...overrides,
  };
}
