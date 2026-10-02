import { randomBytes, randomUUID } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const NANOID_ALPHABET =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

export function generateUuid(): string {
  return randomUUID();
}

export function generateUuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateUlid(now = Date.now()): string {
  let time = "";
  for (let remaining = now, index = 0; index < 10; index++) {
    time = CROCKFORD[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  let random = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of randomBytes(10)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      random += CROCKFORD[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return time + random;
}

export function generateNanoid(size = 21): string {
  let id = "";
  for (const byte of randomBytes(size)) id += NANOID_ALPHABET[byte & 63];
  return id;
}

export function validateUuid(input: string): boolean {
  return UUID_PATTERN.test(input.trim());
}
