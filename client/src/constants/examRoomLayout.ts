export type BenchType = 'single' | 'double' | 'triple'

export interface SeatingLayoutRow {
  benchCount: number
  benchType: BenchType
}

export interface RoomSeatingLayout {
  rows: SeatingLayoutRow[]
}

export const BENCH_TYPE_OPTIONS: Array<{ value: BenchType; label: string; seatsPerBench: number }> = [
  { value: 'single', label: 'Single (1 seat)', seatsPerBench: 1 },
  { value: 'double', label: 'Double (2 seats)', seatsPerBench: 2 },
  { value: 'triple', label: 'Triple (3 seats)', seatsPerBench: 3 },
]

export const DEFAULT_SEATING_LAYOUT: RoomSeatingLayout = {
  rows: [{ benchCount: 12, benchType: 'double' }],
}

export function getSeatsPerBench(benchType: BenchType): number {
  return BENCH_TYPE_OPTIONS.find((option) => option.value === benchType)?.seatsPerBench || 0
}

export function calculateRowSeats(row: SeatingLayoutRow): number {
  const benchCount = Math.max(0, Number(row.benchCount) || 0)
  return benchCount * getSeatsPerBench(row.benchType)
}

export function calculateLayoutCapacity(layout?: RoomSeatingLayout | null): number {
  const rows = layout?.rows || []
  return rows.reduce((sum, row) => sum + calculateRowSeats(row), 0)
}

export function normalizeSeatingLayout(input?: RoomSeatingLayout | null): RoomSeatingLayout {
  const rows = (input?.rows || [])
    .map((row) => ({
      benchCount: Math.max(0, Math.min(50, Math.floor(Number(row.benchCount) || 0))),
      benchType: BENCH_TYPE_OPTIONS.some((option) => option.value === row.benchType)
        ? row.benchType
        : 'double',
    }))
    .filter((row) => row.benchCount > 0)

  if (rows.length === 0) {
    return { ...DEFAULT_SEATING_LAYOUT, rows: DEFAULT_SEATING_LAYOUT.rows.map((row) => ({ ...row })) }
  }

  return { rows }
}

export function getRoomSeatingLayout(room: { seatingLayout?: RoomSeatingLayout | null }): RoomSeatingLayout {
  return normalizeSeatingLayout(room.seatingLayout)
}
