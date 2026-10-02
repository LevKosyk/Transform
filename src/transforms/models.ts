import { createShapeOf } from "./shape";

export type ModelType =
  | { kind: "string" | "integer" | "number" | "boolean" | "null" | "unknown" }
  | { kind: "array"; items: ModelType[] }
  | { kind: "object"; name: string };

export interface ModelField {
  key: string;
  type: ModelType;
}

export interface Model {
  name: string;
  fields: ModelField[];
}

export interface InferredModels {
  root: ModelType;
  models: Model[];
}

export function typeName(key: string): string {
  const words =
    key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(/[\p{L}\p{N}]+/gu) ?? [];
  const name = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return /^[A-Za-z_$]/.test(name) ? name : `Item${name || "Value"}`;
}

export function uniqueNames(): (base: string) => string {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  return (base) => {
    let name = base;
    let index = nextSuffix.get(base) ?? 2;
    while (used.has(name)) name = `${base}${index++}`;
    nextSuffix.set(base, index);
    used.add(name);
    return name;
  };
}

function typeKey(type: ModelType): string {
  if (type.kind === "object") return `object:${type.name}`;
  if (type.kind === "array")
    return `array:${type.items.map(typeKey).join("|")}`;
  return type.kind;
}

export function inferModels(root: unknown, rootName: string): InferredModels {
  const models: Model[] = [];
  const shapeNames = new Map<string, string>();
  const unique = uniqueNames();
  const shapeOf = createShapeOf((value) => {
    if (value === null) return "null";
    if (typeof value === "number")
      return Number.isInteger(value) ? "integer" : "number";
    return typeof value;
  });

  function infer(value: unknown, hint: string): ModelType {
    if (value === null) return { kind: "null" };
    if (typeof value === "string") return { kind: "string" };
    if (typeof value === "boolean") return { kind: "boolean" };
    if (typeof value === "number")
      return { kind: Number.isInteger(value) ? "integer" : "number" };
    if (Array.isArray(value)) {
      const items = new Map<string, ModelType>();
      for (const item of value) {
        const type = infer(item, hint);
        items.set(typeKey(type), type);
      }
      return { kind: "array", items: [...items.values()] };
    }
    if (typeof value !== "object") return { kind: "unknown" };
    const shape = shapeOf(value);
    const existing = shapeNames.get(shape);
    if (existing) return { kind: "object", name: existing };
    const name = unique(typeName(hint));
    shapeNames.set(shape, name);
    const fields = Object.entries(value).map(([key, item]) => ({
      key,
      type: infer(item, key),
    }));
    models.push({ name, fields });
    return { kind: "object", name };
  }

  const isObject =
    root !== null && typeof root === "object" && !Array.isArray(root);
  if (!isObject) unique(rootName);
  return { root: infer(root, isObject ? rootName : "Item"), models };
}
