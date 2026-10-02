import { getYaml } from "../transforms/yamlRuntime";
import type { InputType } from "../types";
import { base64Decode, isHttpUrl } from "../transforms/encoding";
import { detectDateKind } from "../transforms/dates";
import { validateUuid } from "../transforms/uuid";
import { decodeJwt } from "../transforms/jwt";

type Detector = { type: InputType; test: (text: string) => boolean };

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const YAML_PATTERN = /^[\w"'][^\n]*:\s|^-\s/m;

function succeeds(task: () => unknown): boolean {
  try {
    return task() !== false;
  } catch {
    return false;
  }
}

function isPrintable(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code <= 31 && code !== 9 && code !== 10 && code !== 13) return false;
  }
  return true;
}

const detectors: Detector[] = [
  {
    type: "jwt",
    test: (text) => JWT_PATTERN.test(text) && succeeds(() => decodeJwt(text)),
  },
  {
    type: "json",
    test: (text) =>
      (text[0] === "{" || text[0] === "[") && succeeds(() => JSON.parse(text)),
  },
  {
    type: "url",
    test: (text) =>
      /^https?:\/\//i.test(text) && succeeds(() => isHttpUrl(new URL(text))),
  },
  { type: "uuid", test: validateUuid },
  {
    type: "timestamp",
    test: (text) => {
      const kind = detectDateKind(text);
      return kind === "seconds" || kind === "milliseconds";
    },
  },
  { type: "date", test: (text) => detectDateKind(text) === "iso" },
  {
    type: "yaml",
    test: (text) =>
      text.includes("\n") &&
      YAML_PATTERN.test(text) &&
      succeeds(() => {
        const yaml = getYaml();
        const doc = yaml.parseDocument(text, { uniqueKeys: true });
        return (
          !doc.errors.length &&
          (yaml.isMap(doc.contents) || yaml.isSeq(doc.contents))
        );
      }),
  },
  {
    type: "base64",
    test: (text) =>
      text.length >= 12 &&
      /[=+/]/.test(text) &&
      succeeds(() => {
        const decoded = base64Decode(text);
        return decoded !== "" && isPrintable(decoded);
      }),
  },
];

export function detectInput(input: string): InputType {
  const text = input.trim();
  if (!text) return "unknown";
  return detectors.find((detector) => detector.test(text))?.type ?? "text";
}
