import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    FRONTEND_URL: z.url(),
    COOKIE_SECRET: z.string().min(16),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    TMDB_API_KEY: z.string().min(1),
    TMDB_BASE_URL: z.url().default('https://api.themoviedb.org/3'),
    TICKET_QR_SECRET: z.string().min(16),
    RESERVATION_HOLD_TTL: z.string().default('10m'),
    PAYMENT_GATEWAY: z.enum(['simulated', 'stripe']).default('simulated'),
    STRIPE_SECRET_KEY: z.string().optional(),
  })
  .refine(
    (env) => env.PAYMENT_GATEWAY !== 'stripe' || !!env.STRIPE_SECRET_KEY,
    {
      message: 'STRIPE_SECRET_KEY é obrigatório quando PAYMENT_GATEWAY=stripe',
      path: ['STRIPE_SECRET_KEY'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Variáveis de ambiente inválidas:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
    );
  }
  return parsed.data;
}
