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

export function formatSlotTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
