import type { InputType, TransformResult } from "../types";
import {
  formatJson,
  minifyJson,
  sortJsonKeys,
  validateJson,
  jsonToYaml,
  yamlToJson,
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
import { generateUuid, validateUuid } from "../transforms/uuid";
import { convertCase, type CaseStyle } from "../transforms/cases";

export type ActionId =
  | "formatJson"
  | "minifyJson"
  | "sortJsonKeys"
  | "validateJson"
  | "jsonToYaml"
  | "yamlToJson"
  | "jsonToTypescript"
  | "jsonToSchema"
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
  | "validateUuid"
  | "camelCase"
  | "pascalCase"
  | "snakeCase"
  | "kebabCase"
  | "constantCase"
  | "lowercase"
  | "uppercase";
export interface Action {
  id: ActionId;
  label: string;
  structured?: boolean;
  noInput?: boolean;
  validation?: boolean;
}
export const actions: Action[] = [
  { id: "formatJson", label: "Format JSON" },
  { id: "minifyJson", label: "Minify JSON" },
  { id: "sortJsonKeys", label: "Sort JSON Keys" },
  { id: "validateJson", label: "Validate JSON", validation: true },
  { id: "jsonToYaml", label: "JSON → YAML", structured: true },
  { id: "yamlToJson", label: "YAML → JSON", structured: true },
  { id: "jsonToTypescript", label: "JSON → TypeScript", structured: true },
  { id: "jsonToSchema", label: "JSON → JSON Schema", structured: true },
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
  { id: "generateUuid", label: "Generate New UUID", noInput: true },
  { id: "validateUuid", label: "Validate UUID", validation: true },
  { id: "camelCase", label: "camelCase" },
  { id: "pascalCase", label: "PascalCase" },
  { id: "snakeCase", label: "snake_case" },
  { id: "kebabCase", label: "kebab-case" },
  { id: "constantCase", label: "CONSTANT_CASE" },
  { id: "lowercase", label: "lowercase" },
  { id: "uppercase", label: "UPPERCASE" },
];
const byId = Object.fromEntries(
  actions.map((action) => [action.id, action]),
) as Record<ActionId, Action>;
export function actionById(id: ActionId): Action {
  return byId[id];
}
const stringActions: ActionId[] = [
  "base64Encode",
  "urlEncode",
  "camelCase",
  "pascalCase",
  "snakeCase",
  "kebabCase",
  "constantCase",
  "lowercase",
  "uppercase",
];
const actionMap: Record<InputType, ActionId[]> = {
  json: [
    "formatJson",
    "minifyJson",
    "sortJsonKeys",
    "validateJson",
    "jsonToYaml",
    "jsonToTypescript",
    "jsonToSchema",
  ],
  yaml: ["yamlToJson", ...stringActions],
  jwt: ["decodeJwt", "copyJwtPayload"],
  base64: ["base64Decode", "base64Encode"],
  timestamp: ["timestampToDate", "copyIsoDate"],
  date: ["dateToTimestamp", "timestampToDate", "copyIsoDate"],
  url: ["urlEncode", "urlDecode", "parseUrl", "parseQuery"],
  uuid: ["validateUuid", "generateUuid"],
  text: stringActions,
  unknown: ["generateUuid"],
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
  lowercase: "lower",
  uppercase: "upper",
};
export type DateFormat = "local" | "utc" | "seconds" | "milliseconds";
export interface ExecuteOptions {
  indentation?: Indentation;
  typescriptKind?: "interface" | "type";
  typescriptRootName?: string;
  typescriptExport?: boolean;
  typescriptOptionalProperties?: boolean;
  dateFormat?: DateFormat;
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
  const indentation = options.indentation ?? "2";
  switch (id) {
    case "formatJson":
      return { text: formatJson(input, indentation), language: "json" };
    case "minifyJson":
      return { text: minifyJson(input), language: "json" };
    case "sortJsonKeys":
      return { text: sortJsonKeys(input, indentation), language: "json" };
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
            rootName: options.typescriptRootName,
            export: options.typescriptExport,
            optionalProperties: options.typescriptOptionalProperties,
          },
        ),
        language: "typescript",
      };
    case "jsonToSchema":
      return { text: jsonToSchema(input, indentation), language: "json" };
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
