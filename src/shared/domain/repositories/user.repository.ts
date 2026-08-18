import { User } from '../entities/user';

export interface CreateUserInput {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: User['role'];
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
