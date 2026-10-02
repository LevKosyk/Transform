/** Load parsers only when a command or detector needs them. */
let yaml: typeof import("yaml") | undefined;
let toml: typeof import("smol-toml") | undefined;
let json5: typeof import("json5") | undefined;

/* eslint-disable @typescript-eslint/no-require-imports -- keeps bundled parser initialization lazy. */
export function getYaml(): typeof import("yaml") {
  return (yaml ??= require("yaml") as typeof import("yaml"));
}

export function getToml(): typeof import("smol-toml") {
  return (toml ??= require("smol-toml") as typeof import("smol-toml"));
}

export function getJson5(): typeof import("json5") {
  return (json5 ??= require("json5") as typeof import("json5"));
}
/* eslint-enable @typescript-eslint/no-require-imports */
