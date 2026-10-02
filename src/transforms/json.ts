import { parseJsonc } from "./jsonc";
import { compareKeys } from "./shape";
import { getYaml } from "./runtime";

export type Indentation = "2" | "4" | "tab";
export function indentValue(value: Indentation): string | number {
  return value === "tab" ? "\t" : Number(value);
}
export function parseJson(input: string): unknown {
  return JSON.parse(input);
}
export function formatJson(
  input: string,
  indentation: Indentation = "2",
): string {
  return JSON.stringify(parseJson(input), null, indentValue(indentation));
}
export function minifyJson(input: string): string {
  return JSON.stringify(parseJson(input));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareKeys)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  return value;
}
export function sortJsonKeys(
  input: string,
  indentation: Indentation = "2",
): string {
  return JSON.stringify(
    sortKeys(parseJson(input)),
    null,
    indentValue(indentation),
  );
}
export function jsonToYaml(input: string): string {
  return getYaml().stringify(parseJson(input)).trimEnd();
}
export function yamlToJson(
  input: string,
  indentation: Indentation = "2",
): string {
  const document = getYaml().parseDocument(input, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  return JSON.stringify(document.toJS(), null, indentValue(indentation));
}
export function validateJson(
  input: string,
):
  | { valid: true }
  | { valid: false; message: string; line?: number; column?: number } {
  try {
    parseJson(input);
    return { valid: true };
  } catch (error) {
    let message = error instanceof Error ? error.message : "Invalid JSON";
    try {
      parseJsonc(input, true);
    } catch (strictError) {
      if (strictError instanceof Error) message = strictError.message;
    }
    const lineColumn = /line (\d+),? column (\d+)/i.exec(message);
    return lineColumn
      ? {
          valid: false,
          message: message.replace(/ at line \d+, column \d+\.$/, "."),
          line: Number(lineColumn[1]),
          column: Number(lineColumn[2]),
        }
      : { valid: false, message };
  }
}
function parseStructured(input: string): unknown {
  const trimmed = input.trim();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return undefined;
  try {
    return parseJson(trimmed);
  } catch {
    return undefined;
  }
}
export function escapeJson(input: string): string {
  const structured = parseStructured(input);
  return JSON.stringify(
    structured === undefined ? input : JSON.stringify(structured),
  );
}
export function unescapeJsonString(input: string): string {
  const trimmed = input.trim();
  const quoted =
    trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed
      : `"${trimmed}"`;
  let value: unknown;
  try {
    value = parseJson(quoted);
  } catch {
    throw new Error("Text is not a valid JSON string literal.");
  }
  if (typeof value !== "string")
    throw new Error("Text is not a valid JSON string literal.");
  return value;
}
export function unescapeJson(
  input: string,
  indentation: Indentation = "2",
): { text: string; json: boolean } {
  const text = unescapeJsonString(input);
  const structured = parseStructured(text);
  return structured === undefined
    ? { text, json: false }
    : {
        text: JSON.stringify(structured, null, indentValue(indentation)),
        json: true,
      };
}
export function isEscapedJson(input: string): boolean {
  if (!input.includes('\\"')) return false;
  try {
    return unescapeJson(input).json;
  } catch {
    return false;
  }
}
