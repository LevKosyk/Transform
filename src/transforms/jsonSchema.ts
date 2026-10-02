import { indentValue, type Indentation, parseJson } from "./json";
import { createShapeOf, type ShapeOf } from "./shape";

type JsonSchema = Record<string, unknown>;

function primitiveType(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function createSchemaFor(shapeOf: ShapeOf): (value: unknown) => JsonSchema {
  const schemas = new Map<string, JsonSchema>();
  const schemaFor = (value: unknown): JsonSchema => {
    if (value === null || typeof value !== "object")
      return { type: primitiveType(value) };
    const shape = shapeOf(value);
    const cached = schemas.get(shape);
    if (cached) return cached;
    let schema: JsonSchema;
    if (Array.isArray(value)) {
      const variants = new Map<string, JsonSchema>();
      for (const item of value) {
        const itemShape = shapeOf(item);
        if (!variants.has(itemShape)) variants.set(itemShape, schemaFor(item));
      }
      const items = [...variants.values()];
      schema = {
        type: "array",
        items: items.length > 1 ? { anyOf: items } : (items[0] ?? {}),
      };
    } else {
      const entries = Object.entries(value);
      schema = {
        type: "object",
        properties: Object.fromEntries(
          entries.map(([key, property]) => [key, schemaFor(property)]),
        ),
        ...(entries.length ? { required: entries.map(([key]) => key) } : {}),
        additionalProperties: false,
      };
    }
    schemas.set(shape, schema);
    return schema;
  };
  return schemaFor;
}

export function jsonToSchema(
  input: string,
  indentation: Indentation = "2",
): string {
  const schemaFor = createSchemaFor(createShapeOf(primitiveType));
  return JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...schemaFor(parseJson(input)),
    },
    null,
    indentValue(indentation),
  );
}
