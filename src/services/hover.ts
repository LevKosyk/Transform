import { base64Decode } from "../transforms/encoding";
import { dateFormats, detectDateKind, relativeTime } from "../transforms/dates";
import { decodeJwt, jwtStatus } from "../transforms/jwt";

export const HOVER_TOKEN_PATTERN = /[A-Za-z0-9+/_.=-]{10,}/;

const MAX_TOKEN_LENGTH = 16_384;
const MAX_PREVIEW_LENGTH = 1_000;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const BASE64_PATTERN = /^(?=.{16,}$)[A-Za-z0-9+/]+={0,2}$/;
const READABLE_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}\t\r\n]+$/u;

function codeBlock(text: string, language = ""): string {
  const fence = text.includes("```") ? "````" : "```";
  return `${fence}${language}\n${text}\n${fence}`;
}

function truncate(text: string): string {
  return text.length > MAX_PREVIEW_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…`
    : text;
}

function describeJwt(token: string, now: number): string | undefined {
  if (!JWT_PATTERN.test(token)) return undefined;
  try {
    const { header, payload } = decodeJwt(token);
    return [
      `**Transform · JWT** — ${jwtStatus(payload, now)}`,
      codeBlock(truncate(JSON.stringify(header, null, 2)), "json"),
      codeBlock(truncate(JSON.stringify(payload, null, 2)), "json"),
      "_Signature not verified._",
    ].join("\n\n");
  } catch {
    return undefined;
  }
}

function describeTimestamp(token: string, now: number): string | undefined {
  const kind = detectDateKind(token);
  if (kind !== "seconds" && kind !== "milliseconds") return undefined;
  const formats = dateFormats(token);
  return [
    `**Transform · Unix ${kind}** — ${relativeTime(Number(formats.milliseconds), now)}`,
    `UTC: \`${formats.utc}\`  \nLocal: \`${formats.local}\``,
  ].join("\n\n");
}

function describeBase64(token: string): string | undefined {
  if (
    !BASE64_PATTERN.test(token) ||
    token.length % 4 !== 0 ||
    /^[A-Za-z]+$/.test(token)
  )
    return undefined;
  try {
    const decoded = base64Decode(token);
    if (!READABLE_PATTERN.test(decoded)) return undefined;
    return ["**Transform · Base64**", codeBlock(truncate(decoded))].join(
      "\n\n",
    );
  } catch {
    return undefined;
  }
}

export function describeToken(
  raw: string,
  now = Date.now(),
): string | undefined {
  const token = raw.replace(/^[.=]+|\.+$/g, "");
  if (!token || token.length > MAX_TOKEN_LENGTH) return undefined;
  return (
    describeJwt(token, now) ??
    describeTimestamp(token, now) ??
    describeBase64(token)
  );
}
