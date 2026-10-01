import { indentValue, type Indentation, parseJson } from "./json";

type OutputKind = "interface" | "type";
function nameFor(key: string): string {
  const words =
    key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(/[\p{L}\p{N}]+/gu) ?? [];
  const name = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return /^[A-Za-z_$]/.test(name) ? name : `Item${name || "Value"}`;
}
function propertyName(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
export function jsonToTypescript(
  input: string,
  kind: OutputKind = "interface",
  indentation: Indentation = "2",
  options: {
    rootName?: string;
    export?: boolean;
    optionalProperties?: boolean;
  } = {},
): string {
  const root = parseJson(input);
  const definitions: string[] = [];
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  const shapeNames = new Map<string, string>();
  const shapeCache = new WeakMap<object, string>();
  const indent = indentValue(indentation);
  const pad = typeof indent === "number" ? " ".repeat(indent) : indent;
  const rootName = nameFor(options.rootName?.trim() || "Root");
  const exported = options.export ? "export " : "";
  function unique(base: string): string {
    let name = base;
    let index = nextSuffix.get(base) ?? 2;
    while (used.has(name)) name = `${base}${index++}`;
    nextSuffix.set(base, index);
    used.add(name);
    return name;
  }
  function shapeOf(value: unknown): string {
    if (value === null) return "null";
    if (typeof value !== "object") return typeof value;
    const cached = shapeCache.get(value);
    if (cached) return cached;
    const shape = Array.isArray(value)
      ? JSON.stringify(["array", [...new Set(value.map(shapeOf))].sort()])
      : JSON.stringify([
          "object",
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, shapeOf(item)]),
        ]);
    shapeCache.set(value, shape);
    return shape;
  }
  function typeOf(value: unknown, hint: string): string {
    if (value === null) return "null";
    if (Array.isArray(value)) {
      if (!value.length) return "unknown[]";
      const types = [...new Set(value.map((item) => typeOf(item, hint)))];
      const union = types.join(" | ");
      return types.length > 1 ? `(${union})[]` : `${union}[]`;
    }
    if (typeof value === "object")
      return define(value as Record<string, unknown>, hint);
    return typeof value;
  }
  function define(value: Record<string, unknown>, hint: string): string {
    const shape = shapeOf(value);
    const existing = shapeNames.get(shape);
    if (existing) return existing;
    const name = unique(nameFor(hint));
    shapeNames.set(shape, name);
    const position = definitions.length;
    definitions.push("");
    const properties = Object.entries(value).map(
      ([key, item]) =>
        `${pad}${propertyName(key)}${options.optionalProperties ? "?" : ""}: ${typeOf(item, key)};`,
    );
    const block =
      kind === "interface"
        ? `${exported}interface ${name} {\n${properties.join("\n")}\n}`
        : `${exported}type ${name} = {\n${properties.join("\n")}\n};`;
    definitions[position] = block;
    return name;
  }
  if (root !== null && typeof root === "object" && !Array.isArray(root))
    define(root as Record<string, unknown>, rootName);
  else
    definitions.push(`${exported}type ${rootName} = ${typeOf(root, "Item")};`);
  return definitions.join("\n\n");
}
