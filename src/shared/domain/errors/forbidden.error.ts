import { DomainError } from './domain-error';

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';

  constructor(message = 'Acesso não permitido para este papel') {
    super(message);
  }
}
