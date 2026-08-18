import { Event } from '../entities/event';

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
  findAll(): Promise<Event[]>;
  findByOrganizerId(organizerId: string): Promise<Event[]>;
}

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');
