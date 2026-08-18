import { EventEntity } from '../../src/shared/infra/database/entities/event.entity';
import { SeatEntity } from '../../src/shared/infra/database/entities/seat.entity';
import { TypeOrmEventRepository } from '../../src/shared/infra/database/repositories/typeorm-event.repository';
import { TypeOrmSeatRepository } from '../../src/shared/infra/database/repositories/typeorm-seat.repository';
import { getTestDataSource } from './test-data-source';

export async function buildEventsDependencies() {
  const dataSource = await getTestDataSource();

  const eventRepository = new TypeOrmEventRepository(
    dataSource.getRepository(EventEntity),
  );
  const seatRepository = new TypeOrmSeatRepository(
    dataSource.getRepository(SeatEntity),
  );

  return { eventRepository, seatRepository };
}
