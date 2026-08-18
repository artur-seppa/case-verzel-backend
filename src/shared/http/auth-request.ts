import { FastifyRequest } from 'fastify';
import { UserRole } from '../domain/enums';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
}
