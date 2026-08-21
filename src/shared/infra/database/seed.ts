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

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';

interface SeedEvent {
  title: string;
  synopsis: string;
  posterUrl: string;
  tmdbId: string;
  location: string;
  capacity: number;
  price: string;
  daysFromNow: number;
  hour: number;
}

const SEED_EVENTS: SeedEvent[] = [
  {
    title: 'Homem-Aranha: Um Novo Dia',
    synopsis:
      'É um novo dia para Peter Parker. Combatendo o crime em tempo integral como Homem-Aranha em um mundo que não se lembra mais dele, Peter passa por uma mudança que talvez nem ele tenha o poder de controlar.',
    posterUrl: `${POSTER_BASE_URL}/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg`,
    tmdbId: '969681',
    location: 'Cinema Verzel - Sala 3',
    capacity: 24,
    price: '39.90',
    daysFromNow: 14,
    hour: 19,
  },
  {
    title: 'Avatar Aang: O Último Mestre do Ar',
    synopsis:
      'Aang, o último Mestre do Ar, precisa aprender a dominar os quatro elementos e enfrentar a Nação do Fogo para trazer equilíbrio ao mundo.',
    posterUrl: `${POSTER_BASE_URL}/tiUtJXN4OZaK2PQM0q8mbbBgKS4.jpg`,
    tmdbId: '980431',
    location: 'Cinema Verzel - Sala 1',
    capacity: 30,
    price: '32.90',
    daysFromNow: 3,
    hour: 16,
  },
  {
    title: 'Como Mágica',
    synopsis:
      'Uma comédia sobre reencontrar a magia nos pequenos momentos da vida.',
    posterUrl: `${POSTER_BASE_URL}/2TZiL4ZYOwWeIjGfz3glpMuPqpN.jpg`,
    tmdbId: '1007757',
    location: 'Cinema Verzel - Sala 2',
    capacity: 20,
    price: '29.90',
    daysFromNow: 5,
    hour: 21,
  },
  {
    title: 'Demon Slayer: Kimetsu no Yaiba – Castelo Infinito',
    synopsis:
      'Tanjiro e os demais caçadores de demônios enfrentam o Castelo Infinito na batalha final contra Muzan Kibutsuji.',
    posterUrl: `${POSTER_BASE_URL}/41XdjOXGQoH0HTDNqEfwKGvGgwm.jpg`,
    tmdbId: '1311031',
    location: 'Cinema Verzel - Sala 4',
    capacity: 40,
    price: '44.90',
    daysFromNow: 7,
    hour: 20,
  },
  {
    title: 'Um Sonho de Liberdade',
    synopsis:
      'Condenado por um crime que não cometeu, Andy Dufresne encontra esperança e amizade dentro dos muros da penitenciária de Shawshank.',
    posterUrl: `${POSTER_BASE_URL}/umX3lBhHoTV7Lsci140Yr8VpXyN.jpg`,
    tmdbId: '278',
    location: 'Cinema Verzel - Sala 2',
    capacity: 36,
    price: '34.90',
    daysFromNow: 10,
    hour: 18,
  },
  {
    title: 'O Poderoso Chefão',
    synopsis:
      'A saga da família Corleone e a ascensão de Michael ao comando do império do crime organizado.',
    posterUrl: `${POSTER_BASE_URL}/oJagOzBu9Rdd9BrciseCm3U3MCU.jpg`,
    tmdbId: '238',
    location: 'Cinema Verzel - Sala 3',
    capacity: 36,
    price: '39.90',
    daysFromNow: 12,
    hour: 20,
  },
  {
    title: 'Michael',
    synopsis:
      'Um retrato da vida e da carreira do Rei do Pop, Michael Jackson.',
    posterUrl: `${POSTER_BASE_URL}/gXh43JopeO8BlA661BvlkR6yeqs.jpg`,
    tmdbId: '936075',
    location: 'Cinema Verzel - Sala 1',
    capacity: 24,
    price: '37.90',
    daysFromNow: 15,
    hour: 21,
  },
  {
    title: 'Devoradores de Estrelas',
    synopsis:
      'Uma história envolvente que mistura drama e mistério em meio às estrelas.',
    posterUrl: `${POSTER_BASE_URL}/2i8uru7rlbHKaoIbC2V4FZLT7uW.jpg`,
    tmdbId: '687163',
    location: 'Cinema Verzel - Sala 4',
    capacity: 30,
    price: '32.90',
    daysFromNow: 18,
    hour: 19,
  },
  {
    title: 'O Poderoso Chefão: Parte II',
    synopsis:
      'A ascensão de Vito Corleone e o legado de poder herdado por seu filho Michael.',
    posterUrl: `${POSTER_BASE_URL}/3ViYPhSAPwH2avQjdMl49F8PklB.jpg`,
    tmdbId: '240',
    location: 'Cinema Verzel - Sala 3',
    capacity: 36,
    price: '39.90',
    daysFromNow: 19,
    hour: 20,
  },
  {
    title: 'A Lista de Schindler',
    synopsis:
      'Oskar Schindler arrisca tudo para salvar a vida de mais de mil judeus durante o Holocausto.',
    posterUrl: `${POSTER_BASE_URL}/jbnF7dVi8iu80zTsWAC0Om8ZYOu.jpg`,
    tmdbId: '424',
    location: 'Cinema Verzel - Sala 2',
    capacity: 30,
    price: '34.90',
    daysFromNow: 21,
    hour: 18,
  },
  {
    title: '12 Homens e uma Sentença',
    synopsis:
      'Doze jurados debatem o destino de um jovem acusado de assassinato, questionando certezas e preconceitos.',
    posterUrl: `${POSTER_BASE_URL}/aiHIhV8c45FzIlbqYlswrrNyQD6.jpg`,
    tmdbId: '389',
    location: 'Cinema Verzel - Sala 1',
    capacity: 20,
    price: '29.90',
    daysFromNow: 23,
    hour: 17,
  },
  {
    title: 'Corações Jovens',
    synopsis:
      'Um drama sobre amadurecimento, amizade e as escolhas que moldam a juventude.',
    posterUrl: `${POSTER_BASE_URL}/o6HgnIbvKzitcwzmX3AmBjwxgMO.jpg`,
    tmdbId: '1232449',
    location: 'Cinema Verzel - Sala 2',
    capacity: 24,
    price: '29.90',
    daysFromNow: 25,
    hour: 16,
  },
  {
    title: 'Batman: O Cavaleiro das Trevas',
    synopsis:
      'Batman enfrenta o Coringa, um criminoso que mergulha Gotham City no caos.',
    posterUrl: `${POSTER_BASE_URL}/4lj1ikfsSmMZNyfdi8R8Tv5tsgb.jpg`,
    tmdbId: '155',
    location: 'Cinema Verzel - Sala 4',
    capacity: 40,
    price: '44.90',
    daysFromNow: 27,
    hour: 21,
  },
  {
    title: 'A Viagem de Chihiro',
    synopsis:
      'Chihiro se perde em um mundo mágico habitado por espíritos e precisa encontrar um caminho de volta para casa.',
    posterUrl: `${POSTER_BASE_URL}/hhoKhsyJ3hFaxEm5pMdZRiTu2lJ.jpg`,
    tmdbId: '129',
    location: 'Cinema Verzel - Sala 1',
    capacity: 24,
    price: '32.90',
    daysFromNow: 28,
    hour: 15,
  },
  {
    title: 'Chainsaw Man – O Filme: Arco da Reze',
    synopsis:
      'Denji enfrenta uma nova ameaça ao lado da misteriosa Reze nesta continuação do anime Chainsaw Man.',
    posterUrl: `${POSTER_BASE_URL}/tj1XhCQ2Rw2sT2o7lIdqPIYvjsx.jpg`,
    tmdbId: '1218925',
    location: 'Cinema Verzel - Sala 3',
    capacity: 30,
    price: '37.90',
    daysFromNow: 30,
    hour: 20,
  },
  {
    title: 'À Espera de um Milagre',
    synopsis:
      'Em um corredor da morte dos anos 1930, um guarda testemunha o dom sobrenatural de um prisioneiro gigante e gentil.',
    posterUrl: `${POSTER_BASE_URL}/14hEqW67IiHlKpzKMLUXyktzZIV.jpg`,
    tmdbId: '497',
    location: 'Cinema Verzel - Sala 2',
    capacity: 30,
    price: '34.90',
    daysFromNow: 32,
    hour: 19,
  },
  {
    title: 'Dilwale vai levar a noiva',
    synopsis:
      'Um clássico romance de Bollywood sobre dois jovens indianos que se apaixonam durante uma viagem pela Europa.',
    posterUrl: `${POSTER_BASE_URL}/lfRkUr7DYdHldAqi3PwdQGBRBPM.jpg`,
    tmdbId: '19404',
    location: 'Cinema Verzel - Sala 1',
    capacity: 24,
    price: '29.90',
    daysFromNow: 34,
    hour: 17,
  },
  {
    title: 'O Senhor dos Anéis: O Retorno do Rei',
    synopsis:
      'Frodo e Sam seguem em direção à Montanha da Perdição enquanto a batalha final pela Terra-média se aproxima.',
    posterUrl: `${POSTER_BASE_URL}/rU4oIKv5I4C59DpcXKmT7kNwGI0.jpg`,
    tmdbId: '122',
    location: 'Cinema Verzel - Sala 4',
    capacity: 40,
    price: '42.90',
    daysFromNow: 35,
    hour: 19,
  },
  {
    title: 'Parasita',
    synopsis:
      'A família Kim se infiltra na vida da rica família Park, revelando as tensões de classe da sociedade sul-coreana.',
    posterUrl: `${POSTER_BASE_URL}/igw938inb6Fy0YVcwIyxQ7Lu5FO.jpg`,
    tmdbId: '496243',
    location: 'Cinema Verzel - Sala 3',
    capacity: 30,
    price: '37.90',
    daysFromNow: 37,
    hour: 21,
  },
  {
    title: 'Interestelar',
    synopsis:
      'Um grupo de astronautas atravessa um buraco de minhoca em busca de um novo lar para a humanidade.',
    posterUrl: `${POSTER_BASE_URL}/6ricSDD83BClJsFdGB6x7cM0MFQ.jpg`,
    tmdbId: '157336',
    location: 'Cinema Verzel - Sala 2',
    capacity: 36,
    price: '39.90',
    daysFromNow: 40,
    hour: 20,
  },
];

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

  if (organizerId) {
    for (const seedEvent of SEED_EVENTS) {
      const existingEvent = await eventRepository.findOneBy({
        tmdbId: seedEvent.tmdbId,
      });
      if (existingEvent) {
        console.log(`evento já existe: ${existingEvent.title}`);
        continue;
      }

      const eventDate = new Date();
      eventDate.setUTCDate(eventDate.getUTCDate() + seedEvent.daysFromNow);
      eventDate.setUTCHours(seedEvent.hour, 0, 0, 0);

      const event = await eventRepository.save(
        eventRepository.create({
          id: ulid(),
          organizerId,
          title: seedEvent.title,
          synopsis: seedEvent.synopsis,
          posterUrl: seedEvent.posterUrl,
          tmdbId: seedEvent.tmdbId,
          date: eventDate,
          location: seedEvent.location,
          capacity: seedEvent.capacity,
          price: seedEvent.price,
        }),
      );

      const seats = generateSeatGrid(seedEvent.capacity).map((seat) =>
        seatRepository.create({ id: ulid(), eventId: event.id, ...seat }),
      );
      await seatRepository.save(seats);
      console.log(
        `criado: evento "${event.title}" com ${seats.length} assentos`,
      );
    }
  }

  await AppDataSource.destroy();
  console.log(`\nSenha para todos os usuários de seed: ${SEED_PASSWORD}`);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
