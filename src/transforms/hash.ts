import { createHash } from "node:crypto";

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

export function hash(input: string, algorithm: HashAlgorithm): string {
  return createHash(algorithm).update(input, "utf8").digest("hex");
}
