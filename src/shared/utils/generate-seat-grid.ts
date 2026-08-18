export interface GridSeat {
  row: string;
  number: number;
  label: string;
}

const SEATS_PER_ROW = 10;

export function generateSeatGrid(capacity: number): GridSeat[] {
  const seats: GridSeat[] = [];
  let remaining = capacity;
  let rowIndex = 0;

  while (remaining > 0) {
    const row = String.fromCharCode(65 + rowIndex);
    const seatsInRow = Math.min(SEATS_PER_ROW, remaining);

    for (let number = 1; number <= seatsInRow; number++) {
      seats.push({ row, number, label: `${row}${number}` });
    }

    remaining -= seatsInRow;
    rowIndex++;
  }

  return seats;
}
