export type DateInputKind = "seconds" | "milliseconds" | "iso";
export interface DateFormats {
  local: string;
  utc: string;
  seconds: string;
  milliseconds: string;
}

const SECONDS_PATTERN = /^-?\d{10}$/;
const MILLISECONDS_PATTERN = /^-?\d{13}$/;
const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

let localFormatter: Intl.DateTimeFormat | undefined;

function kindOf(text: string): DateInputKind | undefined {
  if (SECONDS_PATTERN.test(text)) return "seconds";
  if (MILLISECONDS_PATTERN.test(text)) return "milliseconds";
  if (ISO_PATTERN.test(text) && !Number.isNaN(Date.parse(text))) return "iso";
  return undefined;
}

export function detectDateKind(input: string): DateInputKind | undefined {
  return kindOf(input.trim());
}

export function parseDateInput(input: string): Date {
  const text = input.trim();
  const kind = kindOf(text);
  if (!kind)
    throw new Error(
      "Enter a 10-digit Unix seconds timestamp, 13-digit milliseconds timestamp, or ISO 8601 date.",
    );
  const date = new Date(
    kind === "iso" ? text : Number(text) * (kind === "seconds" ? 1000 : 1),
  );
  if (Number.isNaN(date.getTime()))
    throw new Error("Date is outside the supported range.");
  return date;
}

export function dateFormats(input: string): DateFormats {
  const date = parseDateInput(input);
  const time = date.getTime();
  localFormatter ??= new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
  return {
    local: localFormatter.format(date),
    utc: date.toISOString(),
    seconds: String(Math.floor(time / 1000)),
    milliseconds: String(time),
  };
}
