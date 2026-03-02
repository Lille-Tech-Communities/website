export const FRENCH_MONTHS: Record<string, string> = {
  JAN: "01",
  FEV: "02",
  MAR: "03",
  AVR: "04",
  MAI: "05",
  JUI: "06",
  JUIL: "07",
  AOU: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

export function parseFrenchDate(
  monthAbbr: string,
  day: string,
  currentYear?: number,
): Date {
  const now = new Date();
  const year = currentYear || now.getFullYear();

  const monthNum = FRENCH_MONTHS[monthAbbr.toUpperCase()] || "01";
  let date = new Date(`${year}-${monthNum}-${day.padStart(2, "0")}T00:00:00`);

  // Si la date est passée, essayer l'année suivante
  if (date < now) {
    date = new Date(`${year + 1}-${monthNum}-${day.padStart(2, "0")}T00:00:00`);
  }

  return date;
}

export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}
