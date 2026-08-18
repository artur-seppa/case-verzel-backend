import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1787073605334 implements MigrationInterface {
  name = 'InitSchema1787073605334';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('organizer', 'client', 'gatekeeper');
      CREATE TABLE "users" (
        "id" varchar(26) PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL UNIQUE,
        "passwordHash" varchar(255) NOT NULL,
        "role" "users_role_enum" NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "events" (
        "id" varchar(26) PRIMARY KEY,
        "organizerId" varchar(26) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" varchar(255) NOT NULL,
        "synopsis" text,
        "posterUrl" text,
        "tmdbId" varchar(32) NOT NULL,
        "date" timestamptz NOT NULL,
        "location" varchar(255) NOT NULL,
        "capacity" int NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_events_organizerId" ON "events" ("organizerId");

      CREATE TYPE "reservations_status_enum" AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'declined');
      CREATE TABLE "reservations" (
        "id" varchar(26) PRIMARY KEY,
        "eventId" varchar(26) NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
        "clientId" varchar(26) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" "reservations_status_enum" NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_reservations_eventId" ON "reservations" ("eventId");
      CREATE INDEX "IDX_reservations_clientId" ON "reservations" ("clientId");

      CREATE TYPE "seats_status_enum" AS ENUM ('available', 'held', 'sold');
      CREATE TABLE "seats" (
        "id" varchar(26) PRIMARY KEY,
        "eventId" varchar(26) NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
        "row" varchar(4) NOT NULL,
        "number" int NOT NULL,
        "label" varchar(8) NOT NULL,
        "status" "seats_status_enum" NOT NULL DEFAULT 'available',
        "reservationId" varchar(26) REFERENCES "reservations"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_seat_event_label" UNIQUE ("eventId", "label")
      );
      CREATE INDEX "IDX_seats_eventId" ON "seats" ("eventId");
      CREATE INDEX "IDX_seats_reservationId" ON "seats" ("reservationId");

      CREATE TYPE "payments_status_enum" AS ENUM ('approved', 'declined');
      CREATE TABLE "payments" (
        "id" varchar(26) PRIMARY KEY,
        "reservationId" varchar(26) NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
        "status" "payments_status_enum" NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_payments_reservationId" ON "payments" ("reservationId");

      CREATE TYPE "tickets_status_enum" AS ENUM ('valid', 'used');
      CREATE TABLE "tickets" (
        "id" varchar(26) PRIMARY KEY,
        "reservationId" varchar(26) NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
        "eventId" varchar(26) NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
        "seatId" varchar(26) NOT NULL UNIQUE REFERENCES "seats"("id") ON DELETE CASCADE,
        "clientId" varchar(26) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "qrToken" text NOT NULL UNIQUE,
        "shareToken" varchar(32) NOT NULL UNIQUE,
        "status" "tickets_status_enum" NOT NULL DEFAULT 'valid',
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_tickets_reservationId" ON "tickets" ("reservationId");
      CREATE INDEX "IDX_tickets_eventId" ON "tickets" ("eventId");
      CREATE INDEX "IDX_tickets_clientId" ON "tickets" ("clientId");

      CREATE TABLE "refresh_tokens" (
        "id" varchar(26) PRIMARY KEY,
        "userId" varchar(26) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" varchar(255) NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "refresh_tokens";
      DROP TABLE "tickets";
      DROP TYPE "tickets_status_enum";
      DROP TABLE "payments";
      DROP TYPE "payments_status_enum";
      DROP TABLE "seats";
      DROP TYPE "seats_status_enum";
      DROP TABLE "reservations";
      DROP TYPE "reservations_status_enum";
      DROP TABLE "events";
      DROP TABLE "users";
      DROP TYPE "users_role_enum";
    `);
  }
}
