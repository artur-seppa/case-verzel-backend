export interface Event {
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
  createdAt: Date;
}
