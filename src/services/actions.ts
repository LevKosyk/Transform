import type { InputType, TransformResult } from "../types";
import {
  formatJson,
  minifyJson,
  sortJsonKeys,
  validateJson,
  escapeJson,
  unescapeJson,
  jsonToYaml,
  yamlToJson,
  indentValue,
  type Indentation,
} from "../transforms/json";
import { jsonToTypescript } from "../transforms/typescript";
import { jsonToSchema } from "../transforms/jsonSchema";
import { decodeJwt, formatJwt } from "../transforms/jwt";
import {
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  parseUrl,
  parseQuery,
} from "../transforms/encoding";
import { dateFormats } from "../transforms/dates";
import {
  generateNanoid,
  generateUlid,
  generateUuid,
  generateUuidV7,
  validateUuid,
} from "../transforms/uuid";
import { hash, type HashAlgorithm } from "../transforms/hash";
import { convertCase, type CaseStyle } from "../transforms/cases";
import {
  jsonToGo,
  jsonToPython,
  jsonToRust,
  jsonToZod,
} from "../transforms/codegen";
import {
  csvToJson,
  json5ToJson,
  jsonToCsv,
  jsonToJson5,
  jsonToToml,
  tomlToJson,
} from "../transforms/formats";
import { queryJson } from "../transforms/jsonPath";
import { jsoncToYaml, yamlToJsonc } from "../transforms/yamlJsonc";

export type ActionId =
  | "formatJson"
  | "minifyJson"
  | "sortJsonKeys"
  | "validateJson"
  | "escapeJson"
  | "unescapeJson"
  | "jsonToYaml"
  | "yamlToJson"
  | "jsonToTypescript"
  | "jsonToZod"
  | "jsonToGo"
  | "jsonToPython"
  | "jsonToRust"
  | "jsonToSchema"
  | "jsonToCsv"
  | "csvToJson"
  | "jsonToToml"
  | "tomlToJson"
  | "jsonToJson5"
  | "json5ToJson"
  | "yamlToJsonc"
  | "jsoncToYaml"
  | "queryJson"
  | "decodeJwt"
  | "copyJwtPayload"
  | "base64Encode"
  | "base64Decode"
  | "urlEncode"
  | "urlDecode"
  | "parseUrl"
  | "parseQuery"
  | "timestampToDate"
  | "copyIsoDate"
  | "dateToTimestamp"
  | "generateUuid"
  | "generateUuidV7"
  | "generateUlid"
  | "generateNanoid"
  | "validateUuid"
  | "md5"
  | "sha1"
  | "sha256"
  | "sha512"
  | "camelCase"
  | "pascalCase"
  | "snakeCase"
  | "kebabCase"
  | "constantCase"
  | "titleCase"
  | "sentenceCase"
  | "dotCase"
  | "pathCase"
  | "slugify"
  | "lowercase"
  | "uppercase";
export interface Action {
  id: ActionId;
  label: string;
  structured?: boolean;
  noInput?: boolean;
  validation?: boolean;
  jsonInput?: boolean;
  documents?: readonly string[];
}
const JSON_DOCUMENTS = ["json"];
const JSONC_DOCUMENTS = ["jsonc", "json5", "json"];
const YAML_DOCUMENTS = ["yaml"];
function jsonAction(id: ActionId, label: string, structured = true): Action {
  return { id, label, structured, jsonInput: true, documents: JSON_DOCUMENTS };
}
export const actions: Action[] = [
  jsonAction("formatJson", "Format JSON", false),
  jsonAction("minifyJson", "Minify JSON", false),
  jsonAction("sortJsonKeys", "Sort JSON Keys", false),
  {
    id: "validateJson",
    label: "Validate JSON",
    validation: true,
    documents: JSON_DOCUMENTS,
  },
  { id: "escapeJson", label: "Escape as JSON String" },
  { id: "unescapeJson", label: "Unescape JSON String" },
  jsonAction("jsonToYaml", "JSON → YAML"),
  {
    id: "yamlToJson",
    label: "YAML → JSON",
    structured: true,
    documents: YAML_DOCUMENTS,
  },
  {
    id: "yamlToJsonc",
    label: "YAML → JSONC (keep comments)",
    structured: true,
    documents: YAML_DOCUMENTS,
  },
  {
    id: "jsoncToYaml",
    label: "JSONC → YAML (keep comments)",
    structured: true,
    documents: JSONC_DOCUMENTS,
  },
  jsonAction("jsonToTypescript", "JSON → TypeScript"),
  jsonAction("jsonToZod", "JSON → Zod Schema"),
  jsonAction("jsonToGo", "JSON → Go Structs"),
  jsonAction("jsonToPython", "JSON → Python (Pydantic)"),
  jsonAction("jsonToRust", "JSON → Rust (serde)"),
  jsonAction("jsonToSchema", "JSON → JSON Schema"),
  jsonAction("queryJson", "Query JSON Path…"),
  jsonAction("jsonToCsv", "JSON → CSV"),
  {
    id: "csvToJson",
    label: "CSV → JSON",
    structured: true,
    documents: ["csv"],
  },
  jsonAction("jsonToToml", "JSON → TOML"),
  {
    id: "tomlToJson",
    label: "TOML → JSON",
    structured: true,
    documents: ["toml"],
  },
  jsonAction("jsonToJson5", "JSON → JSON5"),
  {
    id: "json5ToJson",
    label: "JSON5 / JSONC → JSON",
    structured: true,
    documents: JSONC_DOCUMENTS,
  },
  { id: "decodeJwt", label: "Decode JWT", structured: true },
  { id: "copyJwtPayload", label: "Copy Payload" },
  { id: "base64Encode", label: "Base64 Encode" },
  { id: "base64Decode", label: "Base64 Decode" },
  { id: "urlEncode", label: "URL Encode" },
  { id: "urlDecode", label: "URL Decode" },
  { id: "parseUrl", label: "Parse URL", structured: true },
  { id: "parseQuery", label: "Parse Query Parameters", structured: true },
  { id: "timestampToDate", label: "Timestamp → Date" },
  { id: "copyIsoDate", label: "Copy ISO Date" },
  { id: "dateToTimestamp", label: "Date → Unix Timestamp" },
  { id: "generateUuid", label: "Generate UUID v4", noInput: true },
  { id: "generateUuidV7", label: "Generate UUID v7", noInput: true },
  { id: "generateUlid", label: "Generate ULID", noInput: true },
  { id: "generateNanoid", label: "Generate Nano ID", noInput: true },
  { id: "validateUuid", label: "Validate UUID", validation: true },
  { id: "md5", label: "MD5 Hash" },
  { id: "sha1", label: "SHA-1 Hash" },
  { id: "sha256", label: "SHA-256 Hash" },
  { id: "sha512", label: "SHA-512 Hash" },
  { id: "camelCase", label: "camelCase" },
  { id: "pascalCase", label: "PascalCase" },
  { id: "snakeCase", label: "snake_case" },
  { id: "kebabCase", label: "kebab-case" },
  { id: "constantCase", label: "CONSTANT_CASE" },
  { id: "titleCase", label: "Title Case" },
  { id: "sentenceCase", label: "Sentence case" },
  { id: "dotCase", label: "dot.case" },
  { id: "pathCase", label: "path/case" },
  { id: "slugify", label: "Slugify" },
  { id: "lowercase", label: "lowercase" },
  { id: "uppercase", label: "UPPERCASE" },
];
const byId = Object.fromEntries(
  actions.map((action) => [action.id, action]),
) as Record<ActionId, Action>;
export function actionById(id: ActionId): Action {
  return byId[id];
}
const generatorActions: ActionId[] = [
  "generateUuid",
  "generateUuidV7",
  "generateUlid",
  "generateNanoid",
];
const hashActions: ActionId[] = ["md5", "sha1", "sha256", "sha512"];
const stringActions: ActionId[] = [
  "base64Encode",
  "urlEncode",
  "escapeJson",
  "camelCase",
  "pascalCase",
  "snakeCase",
  "kebabCase",
  "constantCase",
  "titleCase",
  "sentenceCase",
  "dotCase",
  "pathCase",
  "slugify",
  "lowercase",
  "uppercase",
  ...hashActions,
];
const actionMap: Record<InputType, ActionId[]> = {
  json: [
    "formatJson",
    "minifyJson",
    "sortJsonKeys",
    "validateJson",
    "queryJson",
    "jsonToYaml",
    "jsonToTypescript",
    "jsonToZod",
    "jsonToGo",
    "jsonToPython",
    "jsonToRust",
    "jsonToSchema",
    "jsonToCsv",
    "jsonToToml",
    "jsonToJson5",
    "escapeJson",
  ],
  escapedJson: ["unescapeJson", "escapeJson"],
  json5: ["json5ToJson", "jsoncToYaml"],
  yaml: ["yamlToJson", "yamlToJsonc", ...stringActions],
  toml: ["tomlToJson", ...stringActions],
  csv: ["csvToJson", ...stringActions],
  jwt: ["decodeJwt", "copyJwtPayload"],
  base64: ["base64Decode", "base64Encode"],
  timestamp: ["timestampToDate", "copyIsoDate"],
  date: ["dateToTimestamp", "timestampToDate", "copyIsoDate"],
  url: ["urlEncode", "urlDecode", "parseUrl", "parseQuery"],
  uuid: ["validateUuid", ...generatorActions],
  text: stringActions,
  unknown: generatorActions,
};
export function relevantActions(type: InputType): Action[] {
  return actionMap[type].map(actionById);
}
const caseStyles: Partial<Record<ActionId, CaseStyle>> = {
  camelCase: "camel",
  pascalCase: "pascal",
  snakeCase: "snake",
  kebabCase: "kebab",
  constantCase: "constant",
  titleCase: "title",
  sentenceCase: "sentence",
  dotCase: "dot",
  pathCase: "path",
  slugify: "slug",
  lowercase: "lower",
  uppercase: "upper",
};
const hashAlgorithms: Partial<Record<ActionId, HashAlgorithm>> = {
  md5: "md5",
  sha1: "sha1",
  sha256: "sha256",
  sha512: "sha512",
};
const codeGenerators: Record<
  "jsonToZod" | "jsonToGo" | "jsonToPython" | "jsonToRust",
  [typeof jsonToZod, string]
> = {
  jsonToZod: [jsonToZod, "typescript"],
  jsonToGo: [jsonToGo, "go"],
  jsonToPython: [jsonToPython, "python"],
  jsonToRust: [jsonToRust, "rust"],
};
export type DateFormat = "local" | "utc" | "seconds" | "milliseconds";
export interface ExecuteOptions {
  indentation?: Indentation;
  typescriptKind?: "interface" | "type";
  rootName?: string;
  typescriptExport?: boolean;
  optionalProperties?: boolean;
  dateFormat?: DateFormat;
  jsonPath?: string;
}
function json(value: unknown): TransformResult {
  return { text: JSON.stringify(value, null, 2), language: "json" };
}
export function executeAction(
  id: ActionId,
  input: string,
  options: ExecuteOptions = {},
): TransformResult {
  const caseStyle = caseStyles[id];
  if (caseStyle) return { text: convertCase(input, caseStyle) };
  const hashAlgorithm = hashAlgorithms[id];
  if (hashAlgorithm) return { text: hash(input, hashAlgorithm) };
  const indentation = options.indentation ?? "2";
  switch (id) {
    case "formatJson":
      return { text: formatJson(input, indentation), language: "json" };
    case "minifyJson":
      return { text: minifyJson(input), language: "json" };
    case "sortJsonKeys":
      return { text: sortJsonKeys(input, indentation), language: "json" };
    case "escapeJson":
      return { text: escapeJson(input) };
    case "unescapeJson": {
      const { text, json } = unescapeJson(input, indentation);
      return json ? { text, language: "json" } : { text };
    }
    case "jsonToYaml":
      return { text: jsonToYaml(input), language: "yaml" };
    case "yamlToJson":
      return { text: yamlToJson(input, indentation), language: "json" };
    case "jsonToTypescript":
      return {
        text: jsonToTypescript(
          input,
          options.typescriptKind ?? "interface",
          indentation,
          {
            rootName: options.rootName,
            export: options.typescriptExport,
            optionalProperties: options.optionalProperties,
          },
        ),
        language: "typescript",
      };
    case "jsonToZod":
    case "jsonToGo":
    case "jsonToPython":
    case "jsonToRust": {
      const [generate, language] = codeGenerators[id];
      return {
        text: generate(input, {
          rootName: options.rootName,
          optionalProperties: options.optionalProperties,
          indentation,
        }),
        language,
      };
    }
    case "jsonToSchema":
      return { text: jsonToSchema(input, indentation), language: "json" };
    case "queryJson":
      return {
        text: JSON.stringify(
          queryJson(input, options.jsonPath ?? "$"),
          null,
          indentValue(indentation),
        ),
        language: "json",
      };
    case "jsonToCsv":
      return { text: jsonToCsv(input), language: "csv" };
    case "csvToJson":
      return { text: csvToJson(input, indentation), language: "json" };
    case "jsonToToml":
      return { text: jsonToToml(input), language: "toml" };
    case "tomlToJson":
      return { text: tomlToJson(input, indentation), language: "json" };
    case "jsonToJson5":
      return { text: jsonToJson5(input, indentation), language: "json5" };
    case "json5ToJson":
      return { text: json5ToJson(input, indentation), language: "json" };
    case "yamlToJsonc":
      return { text: yamlToJsonc(input, indentation), language: "jsonc" };
    case "jsoncToYaml":
      return { text: jsoncToYaml(input), language: "yaml" };
    case "decodeJwt":
      return { text: formatJwt(input), language: "plaintext" };
    case "copyJwtPayload":
      return json(decodeJwt(input).payload);
    case "base64Encode":
      return { text: base64Encode(input) };
    case "base64Decode":
      return { text: base64Decode(input) };
    case "urlEncode":
      return { text: urlEncode(input) };
    case "urlDecode":
      return { text: urlDecode(input) };
    case "parseUrl":
      return json(parseUrl(input));
    case "parseQuery":
      return json(parseQuery(input));
    case "timestampToDate":
      return { text: dateFormats(input)[options.dateFormat ?? "utc"] };
    case "copyIsoDate":
      return { text: dateFormats(input).utc };
    case "dateToTimestamp":
      return { text: dateFormats(input).seconds };
    case "generateUuid":
      return { text: generateUuid() };
    case "generateUuidV7":
      return { text: generateUuidV7() };
    case "generateUlid":
      return { text: generateUlid() };
    case "generateNanoid":
      return { text: generateNanoid() };
    case "validateJson":
      throw new Error(
        validateJson(input).valid ? "JSON is valid." : "JSON is invalid.",
      );
    case "validateUuid":
      throw new Error(
        validateUuid(input) ? "UUID is valid." : "UUID is invalid.",
      );
    default:
      throw new Error(`Unsupported action: ${id}`);
  }
}
