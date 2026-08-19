import { createHmac, timingSafeEqual } from 'node:crypto';

export const QR_SECRET = Symbol('QR_SECRET');

function sign(ticketId: string, secret: string): string {
  return createHmac('sha256', secret).update(ticketId).digest('hex');
}

export function signQrToken(ticketId: string, secret: string): string {
  const signature = sign(ticketId, secret);
  return Buffer.from(`${ticketId}.${signature}`).toString('base64url');
}

export function verifyQrToken(token: string, secret: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separatorIndex = decoded.lastIndexOf('.');
  if (separatorIndex === -1) return null;

  const ticketId = decoded.slice(0, separatorIndex);
  const signature = decoded.slice(separatorIndex + 1);
  if (!ticketId || !signature) return null;

  const expected = sign(ticketId, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  return ticketId;
}
