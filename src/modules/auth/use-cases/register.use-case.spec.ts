import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserRole } from '../../../shared/domain/enums';
import { ConflictError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { RegisterUseCase } from './register.use-case';

describe('RegisterUseCase', () => {
  let useCase: RegisterUseCase;
  let deps: Awaited<ReturnType<typeof buildAuthDependencies>>;

  beforeEach(async () => {
    deps = await buildAuthDependencies();
    useCase = new RegisterUseCase(deps.userRepository, deps.tokenService);
  });

  it('creates a user with a hashed password and issues a token pair', async () => {
    const { user, tokens } = await useCase.execute({
      name: 'Nova Cliente',
      email: 'nova.cliente@example.com',
      password: 'senha1234',
      role: UserRole.CLIENT,
    });

    expect(user.id).toBeTruthy();
    expect(user.passwordHash).not.toBe('senha1234');
    expect(await bcrypt.compare('senha1234', user.passwordHash)).toBe(true);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('rejects registration with an email that is already taken', async () => {
    const input = await buildCreateUserInput({
      email: 'duplicado@example.com',
    });
    await deps.userRepository.create(input);

    await expect(
      useCase.execute({
        name: 'Outra Pessoa',
        email: 'duplicado@example.com',
        password: 'senha1234',
        role: UserRole.CLIENT,
      }),
    ).rejects.toThrow(ConflictError);
  });
});
