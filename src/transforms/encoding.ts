import { TextDecoder } from "node:util";

export function base64Encode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}
export function base64Decode(input: string): string {
  const trimmed = input.trim();
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      trimmed,
    ) ||
    !trimmed
  )
    throw new Error("Invalid Base64 input.");
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.toString("base64") !== trimmed)
    throw new Error("Invalid Base64 input.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Base64 data is not valid UTF-8 text.");
  }
}
export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}
export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    throw new Error("Invalid URL encoding.");
  }
}
export function queryObject(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of params) {
    const previous = result[key];
    if (previous === undefined) result[key] = value;
    else
      result[key] = Array.isArray(previous)
        ? [...previous, value]
        : [previous, value];
  }
  return result;
}
export function parseUrl(input: string): object {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter an absolute URL, such as https://example.com/path.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  return {
    protocol: url.protocol,
    host: url.host,
    pathname: url.pathname,
    query: queryObject(url.searchParams),
    hash: url.hash,
  };
}
export function parseQuery(input: string): object {
  const trimmed = input.trim();
  let query: string;
  if (/^https?:\/\//i.test(trimmed)) query = new URL(trimmed).search;
  else query = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
  return queryObject(new URLSearchParams(query));
}
