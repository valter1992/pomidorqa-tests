export interface TimeRange {
  start: Date;
  end: Date;
}

export function slotsOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isPasswordValid(password: string): boolean {
  return password.length >= 8;
}

/**
 * Слот хранится как абсолютный момент времени (UTC), а видеть его участник должен
 * в своём локальном времени — иначе два человека в разных поясах прочитают разное время встречи.
 */
export function formatSlotTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
