import { indentValue, parseJson, type Indentation } from "./json";
import { getJson5, getToml } from "./runtime";

const DELIMITERS = [",", ";", "\t"] as const;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function detectDelimiter(text: string): string {
  const header = text.slice(0, text.search(/\r?\n|$/));
  let best: string = DELIMITERS[0];
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = header.split(delimiter).length - 1;
    if (count > bestCount) [best, bestCount] = [delimiter, count];
  }
  return best;
}

export function parseCsv(
  text: string,
  delimiter = detectDelimiter(text),
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = false;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field.");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.length > 1 || cells[0] !== "");
}

function csvValue(cell: string): unknown {
  if (NUMBER_PATTERN.test(cell)) {
    const number = Number(cell);
    if (Number.isSafeInteger(number) || !Number.isInteger(number))
      return number;
  }
  if (cell === "true") return true;
  if (cell === "false") return false;
  if (cell === "null") return null;
  return cell;
}

export function csvToJson(
  input: string,
  indentation: Indentation = "2",
): string {
  const [header, ...rows] = parseCsv(input.trim());
  if (!header) throw new Error("CSV input is empty.");
  const records = rows.map((cells, index) => {
    if (cells.length !== header.length)
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} fields; the header has ${header.length}.`,
      );
    return Object.fromEntries(
      header.map((column, cell) => [column, csvValue(cells[cell])]),
    );
  });
  return JSON.stringify(records, null, indentValue(indentation));
}

function flatten(
  value: unknown,
  prefix: string,
  row: Map<string, unknown>,
): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length && prefix) row.set(prefix, "{}");
    for (const [key, item] of entries)
      flatten(item, prefix ? `${prefix}.${key}` : key, row);
  } else row.set(prefix || "value", value);
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\n\r]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function jsonToCsv(input: string): string {
  const data = parseJson(input);
  const records = Array.isArray(data) ? data : [data];
  const rows = records.map((record) => {
    const row = new Map<string, unknown>();
    flatten(record, "", row);
    return row;
  });
  const columns = [...new Set(rows.flatMap((row) => [...row.keys()]))];
  if (!columns.length) throw new Error("JSON has no values to convert to CSV.");
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(row.get(column))).join(","),
    ),
  ].join("\n");
}

function hasNull(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  return Object.values(value).some(hasNull);
}

export function tomlToJson(
  input: string,
  indentation: Indentation = "2",
): string {
  return JSON.stringify(getToml().parse(input), null, indentValue(indentation));
}

export function jsonToToml(input: string): string {
  const data = parseJson(input);
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new Error("TOML needs a JSON object at the top level.");
  if (hasNull(data))
    throw new Error(
      "TOML has no null value; remove or replace null values first.",
    );
  return getToml().stringify(data).trim();
}

export function json5ToJson(
  input: string,
  indentation: Indentation = "2",
): string {
  return JSON.stringify(
    getJson5().parse(input),
    null,
    indentValue(indentation),
  );
}

export function jsonToJson5(
  input: string,
  indentation: Indentation = "2",
): string {
  return getJson5().stringify(parseJson(input), null, indentValue(indentation));
}

export function isCsv(input: string): boolean {
  const lines = input.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2 || /^[{[]/.test(input)) return false;
  const delimiter = detectDelimiter(input);
  try {
    const rows = parseCsv(input, delimiter);
    return (
      rows.length >= 2 &&
      rows[0].length >= 2 &&
      rows.every((row) => row.length === rows[0].length)
    );
  } catch {
    return false;
  }
}

export function isToml(input: string): boolean {
  if (!/^\s*(?:\[[^\]\n]+\]|[\w"'.-]+\s*=)/m.test(input)) return false;
  try {
    return Object.keys(getToml().parse(input)).length > 0;
  } catch {
    return false;
  }
}

export function isJson5(input: string): boolean {
  if (input[0] !== "{" && input[0] !== "[") return false;
  try {
    getJson5().parse(input);
    return true;
  } catch {
    return false;
  }
}
