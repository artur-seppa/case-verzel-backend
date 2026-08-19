import { DomainError } from './domain-error';

export class ServiceUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';

  constructor(
    message = 'Serviço temporariamente indisponível, tente novamente mais tarde',
  ) {
    super(message);
  }
}
