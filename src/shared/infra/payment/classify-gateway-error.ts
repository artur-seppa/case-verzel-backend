const RETRYABLE_STRIPE_ERROR_TYPES = new Set([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
]);

export function isRetryableGatewayError(error: unknown): boolean {
  const type = (error as { type?: string } | null | undefined)?.type;
  return typeof type === 'string' && RETRYABLE_STRIPE_ERROR_TYPES.has(type);
}
