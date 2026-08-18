import { describe, expect, it } from 'vitest';
import { generateSeatGrid } from './generate-seat-grid';

describe('generateSeatGrid', () => {
  it('fills a single row when capacity fits within one row', () => {
    const seats = generateSeatGrid(10);

    expect(seats).toHaveLength(10);
    expect(seats.map((s) => s.label)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10',
    ]);
  });

  it('wraps into a new row after 10 seats, with the last row partially filled', () => {
    const seats = generateSeatGrid(24);

    expect(seats).toHaveLength(24);
    const rows = new Map<string, number>();
    for (const seat of seats) {
      rows.set(seat.row, (rows.get(seat.row) ?? 0) + 1);
    }
    expect(Object.fromEntries(rows)).toEqual({ A: 10, B: 10, C: 4 });
    expect(seats.at(-1)).toEqual({ row: 'C', number: 4, label: 'C4' });
  });

  it('generates a single seat for capacity 1', () => {
    expect(generateSeatGrid(1)).toEqual([{ row: 'A', number: 1, label: 'A1' }]);
  });
});
