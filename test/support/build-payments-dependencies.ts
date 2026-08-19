import { EventEntity } from '../../src/shared/infra/database/entities/event.entity';
import { PaymentEntity } from '../../src/shared/infra/database/entities/payment.entity';
import { TicketEntity } from '../../src/shared/infra/database/entities/ticket.entity';
import { TypeOrmEventRepository } from '../../src/shared/infra/database/repositories/typeorm-event.repository';
import { TypeOrmPaymentRepository } from '../../src/shared/infra/database/repositories/typeorm-payment.repository';
import { TypeOrmTicketRepository } from '../../src/shared/infra/database/repositories/typeorm-ticket.repository';
import { getTestDataSource } from './test-data-source';

export async function buildPaymentsDependencies() {
  const dataSource = await getTestDataSource();

  const eventRepository = new TypeOrmEventRepository(
    dataSource.getRepository(EventEntity),
  );
  const paymentRepository = new TypeOrmPaymentRepository(
    dataSource.getRepository(PaymentEntity),
  );
  const ticketRepository = new TypeOrmTicketRepository(
    dataSource.getRepository(TicketEntity),
  );

  return { eventRepository, paymentRepository, ticketRepository };
}
