import { DomainError } from './domain-error';

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(entity: string, identifier?: string) {
    super(
      identifier
        ? `${entity} não encontrado (${identifier})`
        : `${entity} não encontrado`,
    );
  }
}
