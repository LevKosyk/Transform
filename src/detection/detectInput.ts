import { getYaml } from "../transforms/yamlRuntime";
import type { InputType } from "../types";
import { base64Decode } from "../transforms/encoding";
import { detectDateKind } from "../transforms/dates";
import { validateUuid } from "../transforms/uuid";
import { decodeJwt } from "../transforms/jwt";

type Detector = { type: InputType; test: (text: string) => boolean };
const detectors: Detector[] = [
  {
    type: "jwt",
    test: (text) => {
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text))
        return false;
      try {
        decodeJwt(text);
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    type: "json",
    test: (text) => {
      if (!/^[{[]/.test(text)) return false;
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    type: "url",
    test: (text) => {
      if (!/^https?:\/\//i.test(text)) return false;
      try {
        const url = new URL(text);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
  },
  { type: "uuid", test: validateUuid },
  {
    type: "timestamp",
    test: (text) =>
      ["seconds", "milliseconds"].includes(detectDateKind(text) ?? ""),
  },
  { type: "date", test: (text) => detectDateKind(text) === "iso" },
  {
    type: "yaml",
    test: (text) => {
      if (!/^[\w"'][^\n]*:\s|^-\s/m.test(text) || !text.includes("\n"))
        return false;
      try {
        const yaml = getYaml();
        const doc = yaml.parseDocument(text, { uniqueKeys: true });
        return (
          !doc.errors.length &&
          (yaml.isMap(doc.contents) || yaml.isSeq(doc.contents))
        );
      } catch {
        return false;
      }
    },
  },
  {
    type: "base64",
    test: (text) => {
      if (text.length < 12 || !/[=+/]/.test(text)) return false;
      try {
        const decoded = base64Decode(text);
        if (!decoded) return false;
        for (const char of decoded) {
          const code = char.codePointAt(0) ?? 0;
          if (code <= 31 && code !== 9 && code !== 10 && code !== 13)
            return false;
        }
        return true;
      } catch {
        return false;
      }
    },
  },
];
export function detectInput(input: string): InputType {
  const text = input.trim();
  if (!text) return "unknown";
  return detectors.find((detector) => detector.test(text))?.type ?? "text";
}
