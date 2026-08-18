import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ulid } from 'ulid';
import { AppDataSource } from './data-source';
import { UserEntity } from './entities/user.entity';
import { EventEntity } from './entities/event.entity';
import { SeatEntity } from './entities/seat.entity';
import { UserRole } from '../../domain/enums';
import { generateSeatGrid } from '../../utils/generate-seat-grid';

const SEED_PASSWORD = 'senha123';

const SEED_USERS: Array<{ name: string; email: string; role: UserRole }> = [
  {
    name: 'Ana Organizadora',
    email: 'organizador@verzel.com',
    role: UserRole.ORGANIZER,
  },
  {
    name: 'Carlos Cliente',
    email: 'cliente1@verzel.com',
    role: UserRole.CLIENT,
  },
  {
    name: 'Beatriz Cliente',
    email: 'cliente2@verzel.com',
    role: UserRole.CLIENT,
  },
  {
    name: 'Portaria Verzel',
    email: 'portaria@verzel.com',
    role: UserRole.GATEKEEPER,
  },
];

const SEED_EVENT = {
  title: 'Homem-Aranha: Um Novo Dia',
  synopsis:
    'É um novo dia para Peter Parker. Combatendo o crime em tempo integral como Homem-Aranha em um mundo que não se lembra mais dele, Peter passa por uma mudança que talvez nem ele tenha o poder de controlar.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg',
  tmdbId: '969681',
  location: 'Cinema Verzel - Sala 3',
  capacity: 24,
  price: '39.90',
};

async function seed() {
  await AppDataSource.initialize();
  const userRepository = AppDataSource.getRepository(UserEntity);
  const eventRepository = AppDataSource.getRepository(EventEntity);
  const seatRepository = AppDataSource.getRepository(SeatEntity);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  let organizerId: string | undefined;

  for (const seedUser of SEED_USERS) {
    const existing = await userRepository.findOneBy({ email: seedUser.email });
    if (existing) {
      console.log(`já existe: ${seedUser.email}`);
      if (seedUser.role === UserRole.ORGANIZER) organizerId = existing.id;
      continue;
    }

    const created = await userRepository.save(
      userRepository.create({
        id: ulid(),
        name: seedUser.name,
        email: seedUser.email,
        passwordHash,
        role: seedUser.role,
      }),
    );
    console.log(`criado: ${seedUser.email} (${seedUser.role})`);
    if (seedUser.role === UserRole.ORGANIZER) organizerId = created.id;
  }

  const existingEvent = await eventRepository.findOneBy({
    tmdbId: SEED_EVENT.tmdbId,
  });

  if (existingEvent) {
    console.log(`evento já existe: ${existingEvent.title}`);
  } else if (organizerId) {
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 14);

    const event = await eventRepository.save(
      eventRepository.create({
        id: ulid(),
        organizerId,
        title: SEED_EVENT.title,
        synopsis: SEED_EVENT.synopsis,
        posterUrl: SEED_EVENT.posterUrl,
        tmdbId: SEED_EVENT.tmdbId,
        date: eventDate,
        location: SEED_EVENT.location,
        capacity: SEED_EVENT.capacity,
        price: SEED_EVENT.price,
      }),
    );

    const seats = generateSeatGrid(SEED_EVENT.capacity).map((seat) =>
      seatRepository.create({ id: ulid(), eventId: event.id, ...seat }),
    );
    await seatRepository.save(seats);
    console.log(`criado: evento "${event.title}" com ${seats.length} assentos`);
  }

  await AppDataSource.destroy();
  console.log(`\nSenha para todos os usuários de seed: ${SEED_PASSWORD}`);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
