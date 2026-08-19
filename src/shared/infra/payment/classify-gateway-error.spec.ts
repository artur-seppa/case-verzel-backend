import { describe, expect, it } from 'vitest';
import { isRetryableGatewayError } from './classify-gateway-error';

describe('isRetryableGatewayError', () => {
  it.each([
    ['StripeConnectionError', true],
    ['StripeAPIError', true],
    ['StripeRateLimitError', true],
    ['StripeAuthenticationError', false],
    ['StripeInvalidRequestError', false],
    ['StripePermissionError', false],
  ])('type=%s -> retryable=%s', (type, expected) => {
    expect(isRetryableGatewayError({ type })).toBe(expected);
  });

  it('treats errors without a recognized Stripe type as non-retryable', () => {
    expect(isRetryableGatewayError(new Error('boom'))).toBe(false);
    expect(isRetryableGatewayError(null)).toBe(false);
    expect(isRetryableGatewayError(undefined)).toBe(false);
  });
});
