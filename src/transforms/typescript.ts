import { indentValue, type Indentation, parseJson } from "./json";
import { typeName, uniqueNames } from "./models";
import { createShapeOf } from "./shape";

type OutputKind = "interface" | "type";
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
  const unique = uniqueNames();
  const shapeNames = new Map<string, string>();
  const shapeOf = createShapeOf((value) =>
    value === null ? "null" : typeof value,
  );
  const indent = indentValue(indentation);
  const pad = typeof indent === "number" ? " ".repeat(indent) : indent;
  const rootName = typeName(options.rootName?.trim() || "Root");
  const exported = options.export ? "export " : "";
  const optional = options.optionalProperties ? "?" : "";
  function typeOf(value: unknown, hint: string): string {
    if (value === null) return "null";
    if (Array.isArray(value)) {
      if (!value.length) return "unknown[]";
      const types = new Set(value.map((item) => typeOf(item, hint)));
      const union = [...types].join(" | ");
      return types.size > 1 ? `(${union})[]` : `${union}[]`;
    }
    if (typeof value === "object")
      return define(value as Record<string, unknown>, hint);
    return typeof value;
  }
  function define(value: Record<string, unknown>, hint: string): string {
    const shape = shapeOf(value);
    const existing = shapeNames.get(shape);
    if (existing) return existing;
    const name = unique(typeName(hint));
    shapeNames.set(shape, name);
    const position = definitions.length;
    definitions.push("");
    const body = Object.entries(value)
      .map(
        ([key, item]) =>
          `${pad}${propertyName(key)}${optional}: ${typeOf(item, key)};`,
      )
      .join("\n");
    definitions[position] =
      kind === "interface"
        ? `${exported}interface ${name} {\n${body}\n}`
        : `${exported}type ${name} = {\n${body}\n};`;
    return name;
  }
  if (root !== null && typeof root === "object" && !Array.isArray(root))
    define(root as Record<string, unknown>, rootName);
  else
    definitions.push(`${exported}type ${rootName} = ${typeOf(root, "Item")};`);
  return definitions.join("\n\n");
}
