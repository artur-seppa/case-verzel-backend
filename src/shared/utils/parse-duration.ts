const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(`Duração inválida: ${duration}`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_SECONDS[unit];
}
