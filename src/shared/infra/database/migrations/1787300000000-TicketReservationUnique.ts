import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketReservationUnique1787300000000 implements MigrationInterface {
  name = 'TicketReservationUnique1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_tickets_reservationId";
      ALTER TABLE "tickets" ADD CONSTRAINT "UQ_tickets_reservationId" UNIQUE ("reservationId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tickets" DROP CONSTRAINT "UQ_tickets_reservationId";
      CREATE INDEX "IDX_tickets_reservationId" ON "tickets" ("reservationId");
    `);
  }
}
