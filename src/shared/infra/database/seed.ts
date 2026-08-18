import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ulid } from 'ulid';
import { AppDataSource } from './data-source';
import { UserEntity } from './entities/user.entity';
import { UserRole } from '../../domain/enums';

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

async function seed() {
  await AppDataSource.initialize();
  const userRepository = AppDataSource.getRepository(UserEntity);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const seedUser of SEED_USERS) {
    const existing = await userRepository.findOneBy({ email: seedUser.email });
    if (existing) {
      console.log(`já existe: ${seedUser.email}`);
      continue;
    }

    await userRepository.save(
      userRepository.create({
        id: ulid(),
        name: seedUser.name,
        email: seedUser.email,
        passwordHash,
        role: seedUser.role,
      }),
    );
    console.log(`criado: ${seedUser.email} (${seedUser.role})`);
  }

  await AppDataSource.destroy();
  console.log(`\nSenha para todos os usuários de seed: ${SEED_PASSWORD}`);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
