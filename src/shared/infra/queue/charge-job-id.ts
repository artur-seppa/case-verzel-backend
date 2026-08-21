const SEPARATOR = '#';

export function chargeJobId(reservationId: string, attemptId: string): string {
  return `${reservationId}${SEPARATOR}${attemptId}`;
}

export function jobIdBelongsToReservation(
  jobId: string,
  reservationId: string,
): boolean {
  return jobId.startsWith(`${reservationId}${SEPARATOR}`);
}
