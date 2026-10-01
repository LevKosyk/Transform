import { getYaml } from "./yamlRuntime";

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
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
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
    const message = error instanceof Error ? error.message : "Invalid JSON";
    const match = /position (\d+)/i.exec(message);
    const lineColumn = /line (\d+) column (\d+)/i.exec(message);
    if (lineColumn)
      return {
        valid: false,
        message,
        line: Number(lineColumn[1]),
        column: Number(lineColumn[2]),
      };
    if (match) {
      const prefix = input.slice(0, Number(match[1]));
      const lines = prefix.split(/\r\n|\n|\r/);
      return {
        valid: false,
        message,
        line: lines.length,
        column: lines.at(-1)!.length + 1,
      };
    }
    return { valid: false, message };
  }
}
