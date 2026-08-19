# Fila assíncrona de pagamento (BullMQ + Redis) e CAS pré-Stripe

## Contexto

O fluxo de pagamento atual (`ProcessPaymentUseCase`, em
`src/modules/payments/use-cases/process-payment.use-case.ts`) é síncrono:
a request HTTP chama o gateway (Stripe ou simulado) e só confirma a
reserva (`confirmIfPending`, um `UPDATE ... WHERE status = 'pending_payment'`)
**depois** da resposta do gateway.

Isso tem duas consequências:

1. **Duplo clique / retry de rede cobra duas vezes.** Duas requisições
   concorrentes para a mesma reserva passam ambas pela leitura de status
   (linha 68 do use case, que não trava nada), ambas chamam o gateway, e só
   depois disso uma delas perde a corrida no `confirmIfPending`. A perdedora
   já cobrou o cliente (ou já chamou o gateway) e não tem estorno nesse
   caminho.
2. **A expiração pró-ativa pode correr com o charge.** O projeto já tem um
   `pg_cron` (migration `1787155450473-ReservationExpiry`) rodando a cada
   minuto, cancelando reservas `pending_payment` vencidas independente de
   qualquer request. Ele pode cancelar a reserva no meio de uma chamada ao
   Stripe em andamento — a mesma classe de problema do item 1, mas
   disparada por um processo em background, não por outra request do
   cliente.

A raiz dos dois problemas é a mesma: a única trava atômica do fluxo
(`confirmIfPending`) roda **depois** do charge, não antes.

Além do fix de corretude, este trabalho também introduz processamento
assíncrono via fila (BullMQ + Redis), motivado por três coisas concretas
(não é só "ter fila por ter"):

- Desacoplar a latência do gateway de pagamento da resposta HTTP.
- Retry/backoff automático em falha transiente do gateway (timeout, 5xx).
- Demonstrar a stack no portfólio.

## Decisão arquitetural pré-existente relevante

O `README.md` já documenta, na seção "Concorrência", a escolha deliberada
de **não** segurar uma transação/lock aberta durante a chamada de rede ao
gateway — resolvida hoje via compare-and-swap (`UPDATE ... WHERE status =
'pending_payment'`) depois do charge. O mesmo raciocínio guia este spec: a
correção não pode depender de segurar um lock de banco durante I/O de rede
lento; ela é garantida via CAS.

O README também documenta por que a expiração de reserva usa `pg_cron` (no
banco) em vez de um scheduler da aplicação (`@nestjs/schedule`): a correção
não pode depender do processo da API estar de pé. **Este spec introduz uma
fila cujo processamento depende de um worker process estar de pé** — uma
troca deliberadamente diferente daquela decisão, mas de risco menor: se o
worker cair, o job fica persistido no Redis esperando (o pagamento atrasa),
não se perde nem duplica. Diferente da expiração, que precisa continuar
correta pra sempre independente de qualquer processo, o pagamento é
disparado por uma ação pontual de um usuário vivo — atraso é aceitável,
perda de corretude não.

## Design

### 1. CAS antes do charge (corretude, independe da fila)

Novo status `ReservationStatus.PROCESSING`, entre `PENDING_PAYMENT` e
`CONFIRMED`/`DECLINED`/`CANCELLED`. Novo método no repositório,
`startProcessingIfPending`, mesmo padrão de `confirmIfPending` /
`cancelIfPending` (`TypeOrmReservationRepository.transitionIfPending`):

```sql
UPDATE reservations
SET status = 'processing'
WHERE id = $1 AND status = 'pending_payment'
```

Isso roda **antes** de qualquer chamada ao gateway ou enfileiramento de
job. Se falhar (0 linhas afetadas), a request atual retorna 409 na hora —
duplo clique nunca chega a tocar o gateway nem a fila. Se o `pg_cron`
cancelar a reserva entre a leitura de expiração e esse CAS, o CAS também
falha (a linha já não está mais em `pending_payment`), pelo mesmo motivo —
nenhum charge é disparado para uma reserva que acabou de expirar.

Migration necessária: adicionar `'processing'` ao enum
`reservations_status_enum` no Postgres (`ALTER TYPE ... ADD VALUE`).

### 2. Split do use case

`ProcessPaymentUseCase` (atual) se divide em dois:

- **`RequestPaymentUseCase`** (roda no processo HTTP): busca a reserva,
  valida dono e expiração (mantém a checagem preguiçosa que já existe,
  linha 71), roda o CAS `startProcessingIfPending`, enfileira o job
  `charge-reservation` na fila `payments` com `{ reservationId, clientId,
  cardNumber }`, retorna `202 Accepted` com o `reservationId` (o cliente já
  tem esse id, é o que ele vai usar pra abrir a conexão SSE).
- **`ChargeReservationUseCase`** (roda no worker): reaproveita quase todo o
  corpo do `ProcessPaymentUseCase` atual — chama `paymentGateway.charge`,
  cria o `Payment`, e:
  - aprovado → CAS `processing → confirmed` → vende o assento → emite o
    ticket. **Muda a semântica de `confirmIfPending`**: hoje ele exige
    `WHERE status = 'pending_payment'`; precisa passar a exigir `WHERE
    status = 'processing'`, já que o CAS da seção 1 já moveu a reserva pra
    lá antes do charge. Sem essa mudança, todo pagamento aprovado ficaria
    travado (a condição nunca bateria).
  - recusado (`approved: false`, resultado de negócio, não é exceção) →
    novo método de CAS `processing → pending_payment` (mesma regra de
    hoje: recusa não cancela a reserva, cliente pode tentar de novo com
    outro cartão) → grava `Payment(DECLINED)`. Esse caminho roda dentro do
    próprio use case, no mesmo attempt do job — recusa nunca lança
    exceção, então nunca aciona retry do BullMQ.
  - erro não-retryable ou retries esgotados → **não** é tratado dentro do
    use case (ele só sabe do attempt atual, não se é o último). Ver seção
    5: um listener de `failed` do BullMQ, que só dispara quando o job
    realmente terminou (sem mais tentativas), faz o mesmo CAS `processing
    → pending_payment`, sem gravar `Payment` (nada foi de fato decidido
    pelo gateway).

### 3. Fila (BullMQ) e worker separado

- `@nestjs/bullmq`, fila única `payments`.
- Novo serviço `redis` no `docker-compose.yml` (mesmo padrão do serviço
  `postgres` já existente).
- `PaymentsQueueModule`: registra a fila (produtor, usado pelo
  `RequestPaymentUseCase` no processo HTTP) e o processor (consumidor,
  usado só no worker).
- `ChargeReservationProcessor` (`@Processor('payments')`): chama
  `ChargeReservationUseCase.execute`, classifica erros (seção abaixo).
- **Idempotência do enfileiramento**: `RequestPaymentUseCase` chama
  `queue.add('charge-reservation', payload, { jobId: reservationId })`. O
  CAS da seção 1 já garante que só uma request chega a enfileirar por
  reserva — o `jobId` determinístico é uma segunda camada, redundante por
  desenho: se por algum motivo o enqueue for chamado duas vezes pra mesma
  reserva (retry de rede do client depois de um 202 que ele não recebeu,
  por exemplo), o BullMQ ignora a segunda tentativa enquanto o job
  original ainda não foi removido da fila, em vez de rodar o charge duas
  vezes.
- **Processo separado do processo HTTP**: novo entrypoint `src/worker.ts`
  (`NestFactory.createApplicationContext(WorkerModule)`, sem servidor
  HTTP), rodando como container/processo próprio no deploy. Um crash do
  worker não derruba a API (que continua aceitando reservas e servindo
  consultas) e vice-versa; os dois escalam independentemente.

### 4. Resultado para o cliente: SSE

- Novo endpoint `GET /payments/:reservationId/events` (`@Sse()`, suporte
  nativo do NestJS), no processo HTTP.
- Usa `QueueEvents` do BullMQ (pub/sub sobre o mesmo Redis, sem infra
  extra) escutando os eventos `completed`/`failed` da fila `payments`,
  filtrando pelo `reservationId` do evento antes de emitir pro stream do
  cliente correto.
- Eventos emitidos ao cliente: `confirmed` (com o ticket), `declined` (com
  o motivo), `error` (falha técnica esgotada — cliente pode tentar de novo
  chamando `POST /payments/:reservationId` de novo).

### 5. Classificação de erro / retry

BullMQ, `attempts: 3`, backoff exponencial começando em ~2s (2s, 4s, 8s) —
a janela de expiração da reserva é 10min, então cabe folga suficiente sem
segurar a reserva presa em `processing` por muito tempo se o gateway
estiver instável.

Dentro do processor:

- **Retryable** (deixa o BullMQ tentar de novo — apenas relança o erro):
  timeout de rede, erro 5xx do gateway, rate limit (429).
- **Não-retryable** (lança `UnrecoverableError` do `bullmq` — encerra o job
  na hora, sem consumir as tentativas restantes): payload inválido, erro de
  autenticação (chave inválida), qualquer 4xx do gateway que não seja
  recusa de cartão.
- **Recusa de cartão** (`approved: false`) não é um erro/exceção nesse
  desenho — é um retorno normal do gateway, tratado como resultado de
  negócio (igual ao comportamento síncrono atual), nunca dispara retry.

Em ambos os casos de falha do job (não-retryable ou tentativas esgotadas),
um listener de `failed` no worker garante o CAS de volta pra
`pending_payment` — é o "resarcimento"/rollback do estado da reserva; como
o CAS só confirma a reserva depois de saber que o gateway aprovou, não há
cobrança presa numa reserva que volta pra `pending_payment` nesse caminho
(ver risco residual abaixo para o único cenário em que isso não é
garantido).

### 6. Risco residual conhecido (fora de escopo deste spec)

Se o worker morrer **depois** do gateway aprovar o charge mas **antes** do
CAS `processing → confirmed` ser persistido, a reserva fica presa em
`processing` com o cliente já cobrado e nenhum job pra tentar de novo (o
BullMQ já marcou como perdido/crashado, não há como reagir a isso só com
retry). Isso não é coberto por este spec — a correção completa exige
reconciliação via webhook do Stripe (ou um job de varredura: reservas em
`processing` há mais de N minutos são verificadas contra o status real no
Stripe). Fica documentado aqui como próximo passo, não implementado nesta
entrega.

### 7. Testes

Segue o padrão do repo: nada de mock em teste de use case, roda contra
infra real.

- `ChargeReservationUseCase`: mesma cobertura que `process-payment.use-
  case.spec.ts` já tem hoje (não depende de Redis, não conhece a fila).
- Classificação retryable vs `UnrecoverableError` no processor: teste
  isolado, tabela de casos (timeout, 5xx, 429, 400 inválido, 401, recusa de
  cartão).
- Redis sobe no `docker-compose.yml` igual ao Postgres de teste (mesmo
  padrão do `case_verzel_test`).
- Teste de integração: duas requisições `POST /payments/:reservationId`
  simultâneas para a mesma reserva → apenas uma enfileira job (CAS
  ganhador), a outra recebe `409` imediatamente, sem tocar o gateway nem a
  fila.

### 8. Deploy

Precisa de uma instância Redis (planos free em Railway/Render/Upstash
servem) e um segundo processo rodando `worker.ts`, tipicamente dois
serviços apontando pro mesmo repo com start command diferente
(`start:prod` vs um `start:worker` novo). Documentar no `README.md`, na
mesma seção "Pagamentos" que já existe.

## Fora de escopo

- Reconciliação via webhook do Stripe (seção 6).
- SSE/fila para qualquer outro fluxo além de pagamento.
- Autenticação/autorização da conexão SSE além do que os guards HTTP já
  fazem no momento de abrir a conexão (não há renovação de token durante o
  stream).
