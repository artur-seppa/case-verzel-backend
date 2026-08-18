# Case Verzel — API

Backend da Plataforma de Eventos e Ingressos. NestJS (Fastify adapter) + TypeORM + PostgreSQL, em Clean Architecture (controller → use case → repository) com validação via Zod.

> Projeto em desenvolvimento — este README será expandido conforme as features forem implementadas.

## Stack

- NestJS + `@nestjs/platform-fastify`
- TypeORM + PostgreSQL (Supabase em produção), schema versionado por migrations
- Zod + `nestjs-zod` para validação e DTOs
- JWT (access + refresh) via cookies httpOnly
- Vitest, com testes de use-case rodando contra um Postgres de teste real
- Swagger em `/docs`

## Configuração local

1. Copie o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
2. Preencha os segredos (`COOKIE_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) — pode gerar com:
   ```bash
   openssl rand -hex 32
   ```
3. Preencha `TMDB_API_KEY` com uma chave da [TMDb](https://www.themoviedb.org/settings/api).
4. Suba o Postgres local (porta `5433` no host, pra não bater com um Postgres já instalado na sua máquina):
   ```bash
   docker compose up -d
   ```
5. Instale as dependências, rode as migrations e semeie os dados de teste:
   ```bash
   npm install
   npm run migration:run
   npm run seed
   ```
6. Rode em modo dev:
   ```bash
   npm run start:dev
   ```

A API sobe em `http://localhost:3000/api`, com documentação Swagger em `http://localhost:3000/docs`.

## Testes

```bash
npm test          # roda uma vez
npm run test:watch
npm run test:cov
```

Os testes usam um banco `case_verzel_test` separado (mesma instância Postgres do `docker compose`, porta `5433`) — é criado e migrado automaticamente no `globalSetup` do Vitest na primeira execução, sem passo manual. Cada teste roda contra repositories reais (TypeORM), não mocks, e o banco é truncado entre um teste e outro.

## Dados de seed

`npm run seed` cria (se ainda não existirem) um organizador, dois clientes e um usuário de portaria, todos com senha `senha123`:

| Papel | E-mail |
|---|---|
| Organizador | organizador@verzel.com |
| Cliente | cliente1@verzel.com |
| Cliente | cliente2@verzel.com |
| Portaria | portaria@verzel.com |

Evento e ingressos de exemplo ainda serão adicionados ao seed quando o módulo de eventos estiver pronto.

## Estrutura

```
src/
  modules/       → um módulo por feature (controller, use-cases, dto)
  shared/
    domain/      → entidades e interfaces de repository, erros de domínio
    infra/       → implementações TypeORM dos repositories
    http/        → filters, guards, decorators, pipes globais
```
