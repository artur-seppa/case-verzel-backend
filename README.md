# Case Verzel — API

Backend da Plataforma de Eventos e Ingressos. NestJS (Fastify adapter) + TypeORM + PostgreSQL, em Clean Architecture (controller → use case → repository) com validação via Zod e serializer.

> Projeto em desenvolvimento — este README será expandido conforme as features forem implementadas.

## Stack

- NestJS + `@nestjs/platform-fastify`
- TypeORM + PostgreSQL (Supabase em produção), schema versionado por migrations
- Zod + `nestjs-zod` para validação e DTOs
- JWT (access + refresh) via cookies httpOnly
- Postgres com `pg_cron` (expiração de reservas), Stripe (gateway de pagamento em modo teste, opcional)
- Vitest, com testes de use-case rodando contra um Postgres de teste real
- Swagger em `/docs`

## Configuração local

1. Copie o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
2. Preencha os segredos (`COOKIE_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TICKET_QR_SECRET`) — pode gerar cada um com:
   ```bash
   openssl rand -hex 32
   ```
3. Preencha `TMDB_API_KEY` com uma chave da [TMDb](https://www.themoviedb.org/settings/api).
4. Suba o Postgres e Redis locais. A imagem Postgres é customizada (`docker/postgres/Dockerfile`) pra incluir a extensão `pg_cron`, usada pra expirar reservas não pagas:
   ```bash
   docker compose up -d --build
   ```
   Postgres roda na porta `5433` (pra não bater com um Postgres já instalado) e Redis na porta `6380`, ambos conforme `.env.example`.
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

## Pagamentos

A cobrança é sempre simulada (nenhuma transação real acontece), mas existem dois modos, escolhidos por `PAYMENT_GATEWAY` no `.env`:

- **`simulated`** (padrão, sem nenhuma dependência externa): qualquer número de cartão aprova, exceto `4000000000000002`, que recusa. É o mesmo cartão de recusa genérica que a própria Stripe usa nos testes dela — ver abaixo.
- **`stripe`**: chama de verdade a API da Stripe em [modo teste](https://docs.stripe.com/testing) (sandbox, sem acesso a dinheiro real). Requer `STRIPE_SECRET_KEY`:
  1. Crie uma conta em [stripe.com](https://stripe.com) (toda conta nova já nasce em modo teste, não precisa configurar nada).
  2. Pegue a secret key de teste em [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys) (`sk_test_...`).
  3. No `.env`: `PAYMENT_GATEWAY=stripe` e `STRIPE_SECRET_KEY=sk_test_...`.

Nos dois modos, o **número de cartão que o cliente digita no front é o mesmo** — a UI não muda. Isso é possível porque, em vez de mandar o número do cartão em si pra Stripe (a API deles não aceita dado de cartão bruto vindo direto do backend, por exigência de compliance PCI — só aceitam isso vindo de um client tokenizado com Stripe.js/Elements), a implementação mapeia internamente pra um dos [PaymentMethods de teste pré-prontos que a própria Stripe disponibiliza pra automação sem frontend](https://docs.stripe.com/testing#payment-methods): `pm_card_visa` (aprova) ou `pm_card_chargeDeclined` (recusa). Isso evita ter que colocar Stripe.js/Elements no front só pra uma simulação, e ainda assim faz uma chamada real à API deles.

### Fluxo assíncrono (202 + fila + SSE)

O pagamento é processado de forma assíncrona pra evitar travar a requisição HTTP enquanto a chamada ao gateway de pagamento ocorre. Quando um cliente chama `POST .../payment`, três coisas acontecem em sequência:

1. A API faz uma transição CAS na reserva (`pending_payment → processing`), garantindo que só uma requisição consegue iniciar o processo.
2. A API enfileira um job de cobrança no Redis (BullMQ) com ID = reservationId.
3. A API responde com HTTP 202 (Accepted) e status `'processing'`, sem aguardar o resultado do pagamento.

O cliente então abre uma conexão SSE em `GET .../payment/events` pra aguardar o resultado em tempo real. Um **processo worker** separado (rodando `npm run start:worker:dev` em dev, ou `node dist/worker` em produção) monitora a fila, pega jobs e:

1. Chama o gateway de pagamento (Stripe ou simulado).
2. Se a cobrança for aprovada: faz uma segunda transição CAS (`processing → confirmed`), cria o ingresso e libera o assento como vendido.
3. Se for recusada ou falhar de forma definitiva: reverte a reserva a `pending_payment`, deixando o cliente tentar novamente.

A SSE stream emite eventos de `confirmed` (cobrança aprovada, ingresso criado), `declined` (cartão recusado) ou `error` (falha definitiva na tentativa), e a conexão se encerra.

Uma recusa **não cancela a reserva** — o assento continua reservado e o cliente pode tentar pagar de novo com outro número de cartão, até a reserva expirar (ver abaixo) ou até uma tentativa ser aprovada.

### Concorrência

Três pontos do fluxo disputam o mesmo recurso e usam técnicas diferentes de propósito:

- **Reservar/vender/liberar assento**: lock pessimista (`SELECT ... FOR UPDATE`) dentro de uma transação — a linha do assento fica travada até a transação terminar, então duas reservas simultâneas pro mesmo lugar nunca coexistem; a segunda espera a primeira e recebe conflito.
- **Iniciar o pagamento** (`pending_payment → processing`): um `UPDATE` condicional (`WHERE status = 'pending_payment'`, compare-and-swap) garante que só uma requisição consegue fazer essa transição. Isso era necessário fazer *antes* de enfileirar o job (não depois), porque sem ele, se duas requisições chegassem ao mesmo tempo, ambas enfileiraríam jobs, e poderíamos ter duas tentativas de cobrança simultâneas — duplicação desnecessária mesmo que a segunda falhasse depois. A transição CAS no início cria um "gate" que só deixa passar uma requisição; a segunda já recebe conflito ali mesmo.
- **Confirmar a reserva** (`processing → confirmed`): assim como na iniciação, usa um `UPDATE` condicional. A diferença é que essa confirmação só acontece se o gateway *aprovou* a cobrança — se recusar ou falhar, a reserva volta a `pending_payment`, sem nunca chegar a `confirmed`.

### Idempotência e ingresso

Uma aprovação só pode confirmar a reserva **uma vez**: a confirmação é uma atualização condicional (`UPDATE ... WHERE status = 'processing' AND ...`) — se dois jobs completarem ao mesmo tempo (hipótese improvável em um Redis, mas possível em falhas de retry), só um consegue mudar o status; o outro recebe conflito. Há ainda duas camadas extras de deduplicação:

- **Na fila**: BullMQ usa o `jobId` (neste caso, o `reservationId`) como chave; se duas requisições HTTP chegarem ao mesmo tempo, só uma passa pelo CAS da iniciação; a segunda já recebe conflito ali mesmo.
- **No banco**: `tickets.reservationId` é `UNIQUE`, então mesmo que a lógica falhasse e duas tentativas de criação chegassem ao `confirmIfProcessing`, o Postgres impediria dois ingressos pra mesma reserva com um erro de constraint.

O QR do ingresso carrega o id do ingresso assinado com HMAC-SHA256 (`TICKET_QR_SECRET`) — a portaria valida a assinatura antes de sequer consultar o banco, então um código forjado é rejeitado na hora.

### Fila de pagamento

A fila de pagamento (BullMQ + Redis) oferece retry automático e resiliência contra falhas transitórias na rede ou no gateway. No entanto, há um cenário de falha que fica como resíduo conhecido e documentado: **se o worker falhasse/crashasse entre o gateway aprovar a cobrança e a DB confirmar a reserva**, a reservation ficaria presa no status `processing` com um Payment record em `approved`. Nesse caso:

- A SSE não entregaria nada ao cliente (o job não chegaria em `completed` nem `failed`).
- O cliente continuaria aguardando eternamente ou abriria timeout.
- A reserva estaria travada, inacessível pra novo pagamento.

Resolver isso exigiria **reconciliação com webhooks do Stripe**: ouvir eventos `payment_intent.succeeded` e atualizar reservas presas em `processing`, confirmando-as se o pagamento for de fato aprovado. Essa reconciliação foi explicitamente excluída desta implementação e fica como um passo futuro. Por enquanto, reservas travadas desse jeito exigem intervenção manual (verificar no Stripe se a cobrança foi aceita e atualizar a DB manualmente).

### Expiração da reserva

Toda reserva tem um prazo (`RESERVATION_HOLD_TTL`, padrão `10m`) pra ser paga; passado esse tempo, o assento é liberado. Duas camadas garantem isso:

- **Preguiçosa (garante a correção)**: se alguém tentar pagar uma reserva vencida, ela é cancelada e o assento liberado ali mesmo, na hora — não depende de nenhum job rodando.
- **Proativa (`pg_cron`, roda a cada minuto dentro do próprio Postgres)**: libera assentos de reservas vencidas mesmo que ninguém tente pagá-las, pra quem está navegando ver o assento disponível de novo. Descartei fazer isso com um cron da aplicação (`@nestjs/schedule`) porque a correção não depende dele mesmo — e centralizar num único job dentro do banco funciona igual em dev e produção (o Supabase, usado em produção, suporta `pg_cron` nativamente), sem depender do processo da API estar de pé.

## Dados de seed

`npm run seed` cria (se ainda não existirem) um organizador, dois clientes e um usuário de portaria, todos com senha `senha123`:

| Papel | E-mail |
|---|---|
| Organizador | organizador@verzel.com |
| Cliente | cliente1@verzel.com |
| Cliente | cliente2@verzel.com |
| Portaria | portaria@verzel.com |

Também cria um evento publicado ("Homem-Aranha: Um Novo Dia", TMDb) com 24 assentos disponíveis, daqui a 14 dias. Os dados do filme ficam fixos no próprio script (não depende da TMDb estar no ar pra semear).

## Deploy

A aplicação consiste em dois processos que devem rodar juntos:

1. **Processo HTTP** (`npm run start:prod` ou `node dist/main`): recebe requisições dos clientes e enfileira jobs de pagamento no Redis.
2. **Processo worker** (`npm run start:worker:prod` ou `node dist/worker`): processa jobs da fila, chama o gateway de pagamento e atualiza o banco.

**Dependências em produção:**

- **Postgres**: mesma instância que em dev. A string de conexão vai em `DATABASE_URL`.
- **Redis**: nova dependência introduzida pela fila. A string de conexão vai em `REDIS_URL`.

Ambos os processos **devem apontar para o mesmo `DATABASE_URL` e `REDIS_URL`** — a separação é apenas de responsabilidade, não de dados. Se rodarem em containers/VMs diferentes (ex. HTTP em um dyno, worker em outro), garantir que conseguem alcançar o mesmo Postgres e Redis.

Em produção, é recomendado rodá-los como dois serviços separados (dois containers Docker, dois dynos no Heroku, dois processadores no Render, etc.) pra poder escalar cada um independentemente — se a fila encher, aumenta-se os workers sem precisar de mais workers HTTP.

## Estrutura

```
src/
  modules/       → um módulo por feature (controller, use-cases, dto)
  shared/
    domain/      → entidades e interfaces de repository, erros de domínio
    infra/       → implementações TypeORM dos repositories
    http/        → filters, guards, decorators, pipes globais
```
