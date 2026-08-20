import { Event } from '../entities/event';
import { Paginated, PaginationParams } from '../pagination';

export interface CreateEventInput {
  id: string;
  organizerId: string;
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  tmdbId: string;
  date: Date;
  location: string;
  capacity: number;
  price: string;
}

export interface EventRepository {
  create(input: CreateEventInput): Promise<Event>;
  findById(id: string): Promise<Event | null>;
  findAll(pagination: PaginationParams): Promise<Paginated<Event>>;
  findByOrganizerId(
    organizerId: string,
    pagination: PaginationParams,
  ): Promise<Paginated<Event>>;
}

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');
