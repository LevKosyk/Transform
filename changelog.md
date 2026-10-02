# Changelog

All notable changes to Transform are documented here.

## 1.0.0

Initial release. Everything runs locally and works offline.

### Smart Action

- Select text and press **⌥⌘X** (macOS) or **Ctrl+Alt+X** (Windows/Linux) to see actions for the detected input: JSON, escaped JSON, JSON5/JSONC, YAML, TOML, CSV, JWT, Base64, URL, timestamp, date, UUID, or text.
- With no selection, JSON, YAML, TOML, CSV, and JSON5/JSONC commands use the open document; other commands can use the clipboard.

### JSON

- Format, minify, sort keys recursively, and validate JSON, with the line, column, and cause of any error.
- Query JSON with paths such as `$.users[*].email` or `$..name`, and copy the JSON path at the cursor.
- Escape text as a JSON string, and unescape escaped JSON from logs.
- Generate TypeScript, Zod schemas, Go structs, Python (Pydantic) models, Rust (serde) structs, and JSON Schema (Draft 2020-12) from a JSON sample.

### Conversions

- Convert JSON to and from YAML, CSV, TOML, and JSON5.
- Convert YAML to JSONC and JSONC to YAML while keeping comments.

### Decoding and hover previews

- Hover a Unix timestamp, JWT, or Base64 string to see its decoded value.
- Decode JWTs with expiry status ("Expired 3 hours ago") and relative times for `exp`, `iat`, and `nbf`.
- Encode and decode Base64 and URLs, and parse URLs and query parameters.
- Convert Unix seconds, milliseconds, and ISO 8601 dates.

### Generators and text

- Generate UUID v4, UUID v7, ULID, and Nano ID values, with a different value at every cursor.
- Hash text with MD5, SHA-1, SHA-256, or SHA-512.
- Convert case: camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title Case, Sentence case, dot.case, path/case, slug, lowercase, and UPPERCASE. Text actions apply to every selection.

### Results and errors

- Replace the selection, preview a diff, open a new editor, or copy the result.
- Error notifications offer **Go to Error** to jump to the invalid line and column, and **Show Details** for the full error.
