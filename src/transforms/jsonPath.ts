import { parseJson } from "./json";

type Step =
  | { type: "child"; key: string | number }
  | { type: "wildcard" }
  | { type: "descendant"; key: string | number | "*" };

const STEP_PATTERN =
  /(\.\.|\.)?(?:([A-Za-z_$][\w$-]*)|\*|\[\s*(?:(-?\d+)|\*|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*\])/y;

function parseQuery(query: string): Step[] {
  const text = query.trim().replace(/^\$/, "");
  const steps: Step[] = [];
  let index = 0;
  while (index < text.length) {
    STEP_PATTERN.lastIndex = index;
    const match = STEP_PATTERN.exec(text);
    if (!match || (!match[1] && match[0][0] !== "[" && index > 0))
      throw new Error(
        `Invalid JSON path near "${text.slice(index, index + 12)}". Use paths like $.users[0].email, $.items[*].id or $..name.`,
      );
    const [, separator, name, number, doubleQuoted, singleQuoted] = match;
    const key =
      name ??
      (number !== undefined
        ? Number(number)
        : doubleQuoted !== undefined
          ? (JSON.parse(`"${doubleQuoted}"`) as string)
          : singleQuoted?.replace(/\\(.)/g, "$1"));
    if (separator === "..") steps.push({ type: "descendant", key: key ?? "*" });
    else if (key === undefined) steps.push({ type: "wildcard" });
    else steps.push({ type: "child", key });
    index = STEP_PATTERN.lastIndex;
  }
  return steps;
}

function children(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === "object") return Object.values(value);
  return [];
}

function child(value: unknown, key: string | number): unknown[] {
  if (Array.isArray(value)) {
    if (typeof key !== "number") return [];
    const index = key < 0 ? value.length + key : key;
    return index >= 0 && index < value.length ? [value[index]] : [];
  }
  if (value !== null && typeof value === "object") {
    const name = String(key);
    return Object.hasOwn(value, name)
      ? [(value as Record<string, unknown>)[name]]
      : [];
  }
  return [];
}

function descendants(value: unknown): unknown[] {
  return [value, ...children(value).flatMap(descendants)];
}

export function queryJsonValue(value: unknown, query: string): unknown[] {
  let current = [value];
  for (const step of parseQuery(query)) {
    if (step.type === "wildcard") current = current.flatMap(children);
    else if (step.type === "child")
      current = current.flatMap((item) => child(item, step.key));
    else
      current = current
        .flatMap(descendants)
        .flatMap((item) =>
          step.key === "*" ? children(item) : child(item, step.key),
        );
  }
  return current;
}

export function queryJson(input: string, query: string): unknown[] {
  return queryJsonValue(parseJson(input), query);
}
