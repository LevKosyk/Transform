/** Load the YAML parser only for YAML input or conversion commands. */
let yaml: typeof import("yaml") | undefined;

export function getYaml(): typeof import("yaml") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- keeps bundled YAML initialization lazy.
  return (yaml ??= require("yaml") as typeof import("yaml"));
}
