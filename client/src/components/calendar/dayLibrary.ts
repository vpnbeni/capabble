/**
 * Fixed-date days most Indian schools mark. Festivals whose date moves each year
 * (Diwali, Eid, Holi…) are not here: schools add them from their own list or a CSV.
 */
export const NATIONAL_HOLIDAYS = [
  { month: 8, day: 15, title: 'Independence Day' },
  { month: 10, day: 2, title: 'Gandhi Jayanti' },
  { month: 1, day: 26, title: 'Republic Day' },
] as const

export const OBSERVANCE_DAYS = [
  { month: 6, day: 5, title: 'World Environment Day' },
  { month: 6, day: 21, title: 'International Yoga Day' },
  { month: 9, day: 5, title: "Teachers' Day" },
  { month: 9, day: 14, title: 'Hindi Diwas' },
  { month: 10, day: 31, title: 'Rashtriya Ekta Diwas' },
  { month: 11, day: 14, title: "Children's Day" },
  { month: 11, day: 26, title: 'Constitution Day' },
  { month: 12, day: 26, title: 'Veer Baal Diwas' },
  { month: 1, day: 12, title: 'National Youth Day' },
  { month: 2, day: 21, title: 'International Mother Language Day' },
  { month: 2, day: 28, title: 'National Science Day' },
] as const

/** The date of a month/day inside the session that starts on `sessionStart` ('YYYY-04-01'). */
export const dateInSession = (sessionStart: string, month: number, day: number) => {
  const startYear = Number(sessionStart.slice(0, 4))
  const year = month >= 4 ? startYear : startYear + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
