export type DateInputKind = "seconds" | "milliseconds" | "iso";
export function detectDateKind(input: string): DateInputKind | undefined {
  const text = input.trim();
  if (/^-?\d{10}$/.test(text)) return "seconds";
  if (/^-?\d{13}$/.test(text)) return "milliseconds";
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      text,
    ) &&
    !Number.isNaN(Date.parse(text))
  )
    return "iso";
  return undefined;
}
export function parseDateInput(input: string): Date {
  const kind = detectDateKind(input);
  if (!kind)
    throw new Error(
      "Enter a 10-digit Unix seconds timestamp, 13-digit milliseconds timestamp, or ISO 8601 date.",
    );
  const date = new Date(
    kind === "iso"
      ? input.trim()
      : Number(input.trim()) * (kind === "seconds" ? 1000 : 1),
  );
  if (Number.isNaN(date.getTime()))
    throw new Error("Date is outside the supported range.");
  return date;
}
export function dateFormats(input: string): {
  local: string;
  utc: string;
  seconds: string;
  milliseconds: string;
} {
  const date = parseDateInput(input);
  return {
    local: new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(date),
    utc: date.toISOString(),
    seconds: String(Math.floor(date.getTime() / 1000)),
    milliseconds: String(date.getTime()),
  };
}
