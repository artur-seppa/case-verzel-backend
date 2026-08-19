import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { StripePaymentGatewayService } from './stripe-payment-gateway.service';

function buildStripeStub(create: (params: unknown) => Promise<unknown>) {
  return {
    paymentIntents: { create },
  } as unknown as Stripe;
}

describe('StripePaymentGatewayService', () => {
  it('approves the charge when Stripe confirms the payment intent', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'pi_123', status: 'succeeded' });
    const gateway = new StripePaymentGatewayService(buildStripeStub(create));

    const result = await gateway.charge({
      reservationId: 'res_1',
      amount: '49.90',
      cardNumber: '5555555555554444',
    });

    expect(result.approved).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4990,
        currency: 'brl',
        payment_method: 'pm_card_visa',
        confirm: true,
        off_session: true,
      }),
    );
  });

  it("maps the well-known decline card to Stripe's decline test payment method and declines on a card error", async () => {
    const create = vi.fn().mockRejectedValue({
      type: 'StripeCardError',
      message: 'Your card was declined.',
    });
    const gateway = new StripePaymentGatewayService(buildStripeStub(create));

    const result = await gateway.charge({
      reservationId: 'res_1',
      amount: '49.90',
      cardNumber: '4000000000000002',
    });

    expect(result.approved).toBe(false);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'pm_card_chargeDeclined' }),
    );
  });

  it('rethrows non-card errors instead of treating them as a decline', async () => {
    const create = vi.fn().mockRejectedValue({
      type: 'StripeAuthenticationError',
      message: 'Invalid API key',
    });
    const gateway = new StripePaymentGatewayService(buildStripeStub(create));

    await expect(
      gateway.charge({
        reservationId: 'res_1',
        amount: '49.90',
        cardNumber: '5555555555554444',
      }),
    ).rejects.toMatchObject({ type: 'StripeAuthenticationError' });
  });
});
