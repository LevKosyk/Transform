export type InputType =
  | "json"
  | "escapedJson"
  | "json5"
  | "toml"
  | "csv"
  | "yaml"
  | "jwt"
  | "base64"
  | "timestamp"
  | "date"
  | "url"
  | "uuid"
  | "text"
  | "unknown";
export interface TransformResult {
  text: string;
  language?: string;
}
export type ResultMode = "replace" | "insert" | "copy" | "open" | "preview";
