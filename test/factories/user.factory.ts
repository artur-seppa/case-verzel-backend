import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { ulid } from 'ulid';
import { UserRole } from '../../src/shared/domain/enums';
import { CreateUserInput } from '../../src/shared/domain/repositories/user.repository';

export const SEED_TEST_PASSWORD = 'senha123';

export async function buildCreateUserInput(
  overrides: Partial<CreateUserInput> = {},
): Promise<CreateUserInput> {
  return {
    id: ulid(),
    name: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    passwordHash: await bcrypt.hash(SEED_TEST_PASSWORD, 4),
    role: UserRole.CLIENT,
    ...overrides,
  };
}
