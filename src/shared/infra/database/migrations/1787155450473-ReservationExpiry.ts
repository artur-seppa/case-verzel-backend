import type { MigrationInterface, QueryRunner } from 'typeorm';

const CRON_JOB_NAME = 'release-expired-reservations';

export class ReservationExpiry1787155450473 implements MigrationInterface {
  name = 'ReservationExpiry1787155450473';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservations"
        ADD COLUMN "expiresAt" timestamptz NOT NULL DEFAULT (now() + interval '10 minutes');
      ALTER TABLE "reservations" ALTER COLUMN "expiresAt" DROP DEFAULT;

      ALTER TABLE "tickets"
        ADD CONSTRAINT "UQ_tickets_reservationId" UNIQUE ("reservationId");
    `);

    if (process.env.NODE_ENV === 'test') return;

    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pg_cron;

      SELECT cron.schedule(
        '${CRON_JOB_NAME}',
        '* * * * *',
        $$
        WITH expired AS (
          UPDATE reservations
          SET status = 'cancelled'
          WHERE status = 'pending_payment' AND "expiresAt" < now()
          RETURNING id
        )
        UPDATE seats
        SET status = 'available', "reservationId" = NULL
        WHERE status = 'held' AND "reservationId" IN (SELECT id FROM expired);
        $$
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      await queryRunner.query(`
        SELECT cron.unschedule('${CRON_JOB_NAME}');
        DROP EXTENSION IF EXISTS pg_cron;
      `);
    }

    await queryRunner.query(`
      ALTER TABLE "tickets" DROP CONSTRAINT "UQ_tickets_reservationId";
      ALTER TABLE "reservations" DROP COLUMN "expiresAt";
    `);
  }
}
