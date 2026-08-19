import { describe, expect, it } from 'vitest';
import { signQrToken, verifyQrToken } from './qr-token';

const SECRET = 'a_test_secret_for_signing_qr_tokens';

describe('qr-token', () => {
  it('verifies a token signed with the same secret and returns the ticket id', () => {
    const token = signQrToken('01ARZ3NDEKTSV4RRFFQ69G5FAV', SECRET);

    expect(verifyQrToken(token, SECRET)).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signQrToken('01ARZ3NDEKTSV4RRFFQ69G5FAV', SECRET);

    expect(verifyQrToken(token, 'a_different_secret')).toBeNull();
  });

  it('rejects a tampered ticket id even if the signature looks well-formed', () => {
    const token = signQrToken('01ARZ3NDEKTSV4RRFFQ69G5FAV', SECRET);
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [, signature] = decoded.split('.');
    const forged = Buffer.from(`someone-elses-ticket.${signature}`).toString(
      'base64url',
    );

    expect(verifyQrToken(forged, SECRET)).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(verifyQrToken('not-a-real-token', SECRET)).toBeNull();
  });
});
