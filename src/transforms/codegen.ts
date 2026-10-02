import { convertCase } from "./cases";
import { indentValue, parseJson, type Indentation } from "./json";
import {
  inferModels,
  typeName,
  uniqueNames,
  type InferredModels,
  type ModelType,
} from "./models";

export interface CodegenOptions {
  rootName?: string;
  optionalProperties?: boolean;
  indentation?: Indentation;
}

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
const GO_INITIALISMS = new Set([
  "api",
  "html",
  "http",
  "https",
  "id",
  "ip",
  "json",
  "sql",
  "uri",
  "url",
  "uuid",
  "xml",
]);
const PYTHON_KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
);
const RUST_KEYWORDS = new Set(
  "as async await break const continue dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return static struct trait true type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield try".split(
    " ",
  ),
);
const RUST_RESERVED = new Set(["crate", "self", "super", "Self"]);

function rootName(options: CodegenOptions): string {
  return typeName(options.rootName?.trim() || "Root");
}

function infer(input: string, options: CodegenOptions): InferredModels {
  return inferModels(parseJson(input), rootName(options));
}

function padFor(indentation: Indentation = "2"): string {
  const indent = indentValue(indentation);
  return typeof indent === "number" ? " ".repeat(indent) : indent;
}

function snakeName(key: string, fallback: string): string {
  const name = convertCase(key, "snake");
  if (!name) return fallback;
  return /^\d/.test(name) ? `${fallback}_${name}` : name;
}

export function jsonToZod(input: string, options: CodegenOptions = {}): string {
  const { root, models } = infer(input, options);
  const pad = padFor(options.indentation);
  const optional = options.optionalProperties ? ".optional()" : "";
  const zod = (type: ModelType): string => {
    switch (type.kind) {
      case "string":
        return "z.string()";
      case "integer":
        return "z.number().int()";
      case "number":
        return "z.number()";
      case "boolean":
        return "z.boolean()";
      case "null":
        return "z.null()";
      case "unknown":
        return "z.unknown()";
      case "object":
        return `${type.name}Schema`;
      case "array":
        if (!type.items.length) return "z.array(z.unknown())";
        return type.items.length === 1
          ? `z.array(${zod(type.items[0])})`
          : `z.array(z.union([${type.items.map(zod).join(", ")}]))`;
    }
  };
  const declaration = (name: string, schema: string) =>
    `export const ${name}Schema = ${schema};\nexport type ${name} = z.infer<typeof ${name}Schema>;`;
  const blocks = models.map(({ name, fields }) => {
    const body = fields
      .map(
        ({ key, type }) =>
          `${pad}${IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key)}: ${zod(type)}${optional},`,
      )
      .join("\n");
    return declaration(
      name,
      fields.length ? `z.object({\n${body}\n})` : "z.object({})",
    );
  });
  if (root.kind !== "object")
    blocks.push(declaration(rootName(options), zod(root)));
  return ['import { z } from "zod";', ...blocks].join("\n\n");
}

function goFieldName(key: string): string {
  const words = convertCase(key, "snake").split("_").filter(Boolean);
  const name = words
    .map((word) =>
      GO_INITIALISMS.has(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
  return /^[A-Za-z]/.test(name) ? name : `Field${name}`;
}

export function jsonToGo(input: string, options: CodegenOptions = {}): string {
  const { root, models } = infer(input, options);
  const go = (type: ModelType): string => {
    switch (type.kind) {
      case "string":
        return "string";
      case "integer":
        return "int64";
      case "number":
        return "float64";
      case "boolean":
        return "bool";
      case "null":
      case "unknown":
        return "any";
      case "object":
        return type.name;
      case "array":
        return type.items.length === 1 ? `[]${go(type.items[0])}` : "[]any";
    }
  };
  const omitEmpty = options.optionalProperties ? ",omitempty" : "";
  const blocks = [...models].reverse().map(({ name, fields }) => {
    const unique = uniqueNames();
    const rows = fields.map(({ key, type }) => [
      unique(goFieldName(key)),
      go(type),
      `\`json:${JSON.stringify(key + omitEmpty)}\``,
    ]);
    const nameWidth = Math.max(0, ...rows.map(([field]) => field.length));
    const typeWidth = Math.max(0, ...rows.map(([, type]) => type.length));
    const body = rows
      .map(
        ([field, type, tag]) =>
          `\t${field.padEnd(nameWidth)} ${type.padEnd(typeWidth)} ${tag}`,
      )
      .join("\n");
    return rows.length
      ? `type ${name} struct {\n${body}\n}`
      : `type ${name} struct{}`;
  });
  if (root.kind !== "object")
    blocks.unshift(`type ${rootName(options)} ${go(root)}`);
  return blocks.join("\n\n");
}

export function jsonToPython(
  input: string,
  options: CodegenOptions = {},
): string {
  const { root, models } = infer(input, options);
  const imports = new Set<string>(["BaseModel"]);
  let usesAny = false;
  const python = (type: ModelType): string => {
    switch (type.kind) {
      case "string":
        return "str";
      case "integer":
        return "int";
      case "number":
        return "float";
      case "boolean":
        return "bool";
      case "null":
        return "None";
      case "unknown":
        usesAny = true;
        return "Any";
      case "object":
        return type.name;
      case "array":
        if (!type.items.length) {
          usesAny = true;
          return "list[Any]";
        }
        return `list[${type.items.map(python).join(" | ")}]`;
    }
  };
  const classes = models.map(({ name, fields }) => {
    const unique = uniqueNames();
    const lines = fields.map(({ key, type }) => {
      const name = snakeName(key, "field");
      const field = unique(PYTHON_KEYWORDS.has(name) ? `${name}_` : name);
      let annotation = python(type);
      if (options.optionalProperties && annotation !== "None")
        annotation += " | None";
      const defaults = options.optionalProperties ? ["default=None"] : [];
      if (field !== key) defaults.push(`alias=${JSON.stringify(key)}`);
      if (field !== key) imports.add("Field");
      const value =
        field !== key
          ? ` = Field(${defaults.join(", ")})`
          : options.optionalProperties
            ? " = None"
            : "";
      return `    ${field}: ${annotation}${value}`;
    });
    return `class ${name}(BaseModel):\n${lines.length ? lines.join("\n") : "    pass"}`;
  });
  if (root.kind !== "object") {
    imports.add("RootModel");
    classes.push(
      `class ${rootName(options)}(RootModel[${python(root)}]):\n    pass`,
    );
  }
  const header = [
    ...(usesAny ? ["from typing import Any\n"] : []),
    `from pydantic import ${[...imports].sort().join(", ")}`,
  ].join("\n");
  return [header, ...classes].join("\n\n\n");
}

function rustFieldName(key: string): string {
  let name = snakeName(key, "field");
  if (RUST_RESERVED.has(name)) name = `${name}_`;
  else if (RUST_KEYWORDS.has(name)) name = `r#${name}`;
  return name;
}

export function jsonToRust(
  input: string,
  options: CodegenOptions = {},
): string {
  const { root, models } = infer(input, options);
  const rust = (type: ModelType): string => {
    switch (type.kind) {
      case "string":
        return "String";
      case "integer":
        return "i64";
      case "number":
        return "f64";
      case "boolean":
        return "bool";
      case "null":
        return "Option<serde_json::Value>";
      case "unknown":
        return "serde_json::Value";
      case "object":
        return type.name;
      case "array":
        if (type.items.length === 1) return `Vec<${rust(type.items[0])}>`;
        return "Vec<serde_json::Value>";
    }
  };
  const blocks = [...models].reverse().map(({ name, fields }) => {
    const unique = uniqueNames();
    const lines = fields.flatMap(({ key, type }) => {
      const field = unique(rustFieldName(key));
      let fieldType = rust(type);
      const attributes: string[] = [];
      if (field.replace(/^r#/, "") !== key)
        attributes.push(`rename = ${JSON.stringify(key)}`);
      if (options.optionalProperties) {
        if (!fieldType.startsWith("Option<"))
          fieldType = `Option<${fieldType}>`;
        attributes.push('default, skip_serializing_if = "Option::is_none"');
      }
      return [
        ...(attributes.length
          ? [`    #[serde(${attributes.join(", ")})]`]
          : []),
        `    pub ${field}: ${fieldType},`,
      ];
    });
    return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${name} {${lines.length ? `\n${lines.join("\n")}\n` : ""}}`;
  });
  if (root.kind !== "object")
    blocks.unshift(`pub type ${rootName(options)} = ${rust(root)};`);
  return ["use serde::{Deserialize, Serialize};", ...blocks].join("\n\n");
}
