import { beforeEach, describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import {
  buildCreateUserInput,
  SEED_TEST_PASSWORD,
} from '../../../../test/factories/user.factory';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let deps: Awaited<ReturnType<typeof buildAuthDependencies>>;

  beforeEach(async () => {
    deps = await buildAuthDependencies();
    useCase = new LoginUseCase(deps.userRepository, deps.tokenService);
  });

  it('logs in with correct credentials and issues a token pair', async () => {
    const input = await buildCreateUserInput({ email: 'valida@example.com' });
    await deps.userRepository.create(input);

    const { user, tokens } = await useCase.execute({
      email: 'valida@example.com',
      password: SEED_TEST_PASSWORD,
    });

    expect(user.email).toBe('valida@example.com');
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('rejects a non-existent email', async () => {
    await expect(
      useCase.execute({
        email: 'ninguem@example.com',
        password: SEED_TEST_PASSWORD,
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects an incorrect password', async () => {
    const input = await buildCreateUserInput({
      email: 'senha.errada@example.com',
    });
    await deps.userRepository.create(input);

    await expect(
      useCase.execute({
        email: 'senha.errada@example.com',
        password: 'senha-completamente-errada',
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});
