import { ReservationEntity } from '../../src/shared/infra/database/entities/reservation.entity';
import { TypeOrmReservationRepository } from '../../src/shared/infra/database/repositories/typeorm-reservation.repository';
import { getTestDataSource } from './test-data-source';

export async function buildReservationsDependencies() {
  const dataSource = await getTestDataSource();

  const reservationRepository = new TypeOrmReservationRepository(
    dataSource.getRepository(ReservationEntity),
  );

  return { reservationRepository };
}
