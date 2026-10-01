import { indentValue, type Indentation, parseJson } from "./json";

type JsonSchema = Record<string, unknown>;

function shapeOf(value: unknown, cache: WeakMap<object, string>): string {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  if (typeof value !== "object") return typeof value;
  const cached = cache.get(value);
  if (cached) return cached;
  const shape = Array.isArray(value)
    ? JSON.stringify([
        "array",
        [...new Set(value.map((item) => shapeOf(item, cache)))].sort(),
      ])
    : JSON.stringify([
        "object",
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, shapeOf(item, cache)]),
      ]);
  cache.set(value, shape);
  return shape;
}

function schemaFor(
  value: unknown,
  shapes: WeakMap<object, string>,
  schemas: Map<string, JsonSchema>,
): JsonSchema {
  const shape = shapeOf(value, shapes);
  const cached = schemas.get(shape);
  if (cached) return cached;

  let schema: JsonSchema;
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number")
    return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) {
    if (!value.length) schema = { type: "array", items: {} };
    else {
      const variants = new Map<string, JsonSchema>();
      for (const item of value) {
        const itemShape = shapeOf(item, shapes);
        if (!variants.has(itemShape))
          variants.set(itemShape, schemaFor(item, shapes, schemas));
      }
      const items = [...variants.values()];
      schema = {
        type: "array",
        items: items.length === 1 ? items[0] : { anyOf: items },
      };
    }
  } else if (typeof value === "object") {
    const entries = Object.entries(value);
    schema = {
      type: "object",
      properties: Object.fromEntries(
        entries.map(([key, property]) => [
          key,
          schemaFor(property, shapes, schemas),
        ]),
      ),
      ...(entries.length ? { required: entries.map(([key]) => key) } : {}),
      additionalProperties: false,
    };
  } else {
    schema = {};
  }
  schemas.set(shape, schema);
  return schema;
}

export function jsonToSchema(
  input: string,
  indentation: Indentation = "2",
): string {
  const shapes = new WeakMap<object, string>();
  const schemas = new Map<string, JsonSchema>();
  return JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...schemaFor(parseJson(input), shapes, schemas),
    },
    null,
    indentValue(indentation),
  );
}
