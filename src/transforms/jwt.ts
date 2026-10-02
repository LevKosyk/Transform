import { relativeTime } from "./dates";
import { base64Decode } from "./encoding";

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  timestamps: Record<string, string>;
}

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMESTAMP_CLAIMS = ["exp", "iat", "nbf"] as const;

function decodeSegment(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const value: unknown = JSON.parse(base64Decode(padded));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("JWT header and payload must be JSON objects.");
  return value as Record<string, unknown>;
}

function claimTime(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value * 1000
    : undefined;
}

function claimTimestamps(
  payload: Record<string, unknown>,
): Record<string, string> {
  const timestamps: Record<string, string> = {};
  for (const key of TIMESTAMP_CLAIMS) {
    const time = claimTime(payload, key);
    if (time === undefined) continue;
    const date = new Date(time);
    if (!Number.isNaN(date.getTime())) timestamps[key] = date.toISOString();
  }
  return timestamps;
}

export function decodeJwt(input: string): DecodedJwt {
  const parts = input.trim().split(".");
  if (parts.length !== 3 || !parts.every((part) => SEGMENT_PATTERN.test(part)))
    throw new Error("A JWT must have three Base64URL sections.");
  try {
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    return { header, payload, timestamps: claimTimestamps(payload) };
  } catch {
    throw new Error("JWT header or payload is not valid Base64URL JSON.");
  }
}

export function jwtStatus(
  payload: Record<string, unknown>,
  now = Date.now(),
): string {
  const expires = claimTime(payload, "exp");
  const notBefore = claimTime(payload, "nbf");
  if (expires !== undefined && expires <= now)
    return `Expired ${relativeTime(expires, now)}`;
  if (notBefore !== undefined && notBefore > now)
    return `Not valid yet (starts ${relativeTime(notBefore, now)})`;
  if (expires !== undefined)
    return `Valid (expires ${relativeTime(expires, now)})`;
  return "Valid (no exp claim, never expires)";
}

export function formatJwt(input: string, now = Date.now()): string {
  const { header, payload, timestamps } = decodeJwt(input);
  const sections = [
    `STATUS: ${jwtStatus(payload, now)}`,
    `HEADER\n\n${JSON.stringify(header, null, 2)}`,
    `PAYLOAD\n\n${JSON.stringify(payload, null, 2)}`,
  ];
  const dates = Object.entries(timestamps).map(
    ([key, value]) =>
      `${key}: ${String(payload[key])}\n${value} (${relativeTime(Date.parse(value), now)})`,
  );
  if (dates.length) sections.push(`TIMESTAMPS (UTC)\n\n${dates.join("\n\n")}`);
  sections.push("Signature has not been verified.");
  return sections.join("\n\n");
}
