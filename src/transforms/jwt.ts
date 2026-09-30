import { base64Decode } from "./encoding";
export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  timestamps: Record<string, string>;
}
function decodeSegment(segment: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(segment))
    throw new Error("Invalid JWT segment.");
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const value: unknown = JSON.parse(base64Decode(padded));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("JWT header and payload must be JSON objects.");
  return value as Record<string, unknown>;
}
export function decodeJwt(input: string): DecodedJwt {
  const parts = input.trim().split(".");
  if (
    parts.length !== 3 ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    throw new Error("A JWT must have three Base64URL sections.");
  try {
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    const timestamps: Record<string, string> = {};
    for (const key of ["exp", "iat", "nbf"]) {
      const value = payload[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        const date = new Date(value * 1000);
        if (!Number.isNaN(date.getTime())) timestamps[key] = date.toISOString();
      }
    }
    return { header, payload, timestamps };
  } catch {
    throw new Error("JWT header or payload is not valid Base64URL JSON.");
  }
}
export function formatJwt(input: string): string {
  const jwt = decodeJwt(input);
  const dates = Object.entries(jwt.timestamps).map(
    ([key, value]) => `${key}: ${String(jwt.payload[key])}\n${value}`,
  );
  return `HEADER\n\n${JSON.stringify(jwt.header, null, 2)}\n\nPAYLOAD\n\n${JSON.stringify(jwt.payload, null, 2)}${dates.length ? `\n\nTIMESTAMPS (UTC)\n\n${dates.join("\n\n")}` : ""}\n\nSignature has not been verified.`;
}
