# Case Verzel — API

Backend da Plataforma de Eventos e Ingressos. NestJS (Fastify adapter) + TypeORM + PostgreSQL, em Clean Architecture (controller → use case → repository) com validação via Zod.

> Projeto em desenvolvimento — este README será expandido conforme as features forem implementadas.

## Stack

- NestJS + `@nestjs/platform-fastify`
- TypeORM + PostgreSQL (Supabase em produção)
- Zod + `nestjs-zod` para validação e DTOs
- JWT (access + refresh) via cookies httpOnly
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
4. Suba o Postgres local:
   ```bash
   docker compose up -d
   ```
5. Instale as dependências e rode em modo dev:
   ```bash
   npm install
   npm run start:dev
   ```

A API sobe em `http://localhost:3000/api`, com documentação Swagger em `http://localhost:3000/docs`.

## Estrutura

```
src/
  modules/       → um módulo por feature (controller, use-cases, dto)
  shared/
    domain/      → entidades e interfaces de repository, erros de domínio
    infra/       → implementações TypeORM dos repositories
    http/        → filters, guards, decorators, pipes globais
```
