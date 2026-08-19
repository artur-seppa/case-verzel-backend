import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationProcessingStatus1787200000000
  implements MigrationInterface
{
  name = 'ReservationProcessingStatus1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "reservations_status_enum" ADD VALUE 'processing' AFTER 'pending_payment';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "reservations_status_enum" RENAME TO "reservations_status_enum_old";
      CREATE TYPE "reservations_status_enum" AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'declined');
      ALTER TABLE "reservations" ALTER COLUMN "status" TYPE "reservations_status_enum" USING ("status"::text::"reservations_status_enum");
      DROP TYPE "reservations_status_enum_old";
    `);
  }
}
