import { describe, expect, it } from 'vitest';
import { SimulatedPaymentGatewayService } from './simulated-payment-gateway.service';

describe('SimulatedPaymentGatewayService', () => {
  const gateway = new SimulatedPaymentGatewayService();

  it('approves a charge for a card that does not match the decline pattern', async () => {
    const result = await gateway.charge({
      reservationId: 'res_1',
      idempotencyKey: 'attempt-1',
      amount: '49.90',
      cardNumber: '4242424242424242',
    });

    expect(result.approved).toBe(true);
  });

  it("declines a charge for Stripe's well-known generic-decline test card", async () => {
    const result = await gateway.charge({
      reservationId: 'res_1',
      idempotencyKey: 'attempt-1',
      amount: '49.90',
      cardNumber: '4000000000000002',
    });

    expect(result.approved).toBe(false);
  });
});
