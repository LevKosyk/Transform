# SelectCraft — JSON, JWT & Text Tools for VS Code

Format and validate JSON, generate TypeScript and JSON Schema, convert YAML, decode JWT and Base64, and transform URLs, dates, UUIDs, and text. SelectCraft runs locally and works offline.

**VS Code 1.90+** · **MIT License**

## Quick start

1. Select text in an editor.
2. Press **⌘⇧D** (macOS) or **Ctrl+Shift+D** (Windows/Linux).
3. Choose a relevant action to transform the selection.

![Select JSON, choose a SelectCraft action, and see formatted JSON in VS Code](assets/smart.gif)

You can also run **SelectCraft: Smart Action** from the Command Palette (**⌘⇧P** / **Ctrl+Shift+P**) or the right-click menu.

## Developer tools

| Input  | Actions                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| JSON   | Format, minify, sort keys, validate, convert to YAML or TypeScript, generate JSON Schema |
| YAML   | Convert to formatted JSON                                                                |
| JWT    | Decode header and payload, inspect token dates, copy payload                             |
| Base64 | Encode or decode UTF-8 text                                                              |
| URL    | Encode/decode components, parse URLs and query parameters                                |
| Dates  | Convert Unix seconds, milliseconds, and ISO 8601                                         |
| UUID   | Generate UUID v4 or validate a UUID                                                      |
| Text   | Convert camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, lower/UPPERCASE    |

All commands are available in the Command Palette. The context menu also includes Format JSON, Minify JSON, Decode JWT, and Base64 Decode.

### JSON to TypeScript

Generate declarations for nested objects; objects with matching array shapes share a declaration. Choose to replace the selection, preview a diff, open a new editor, or copy the result. Settings control `interface`/`type`, root name, `export`, and optional properties.

![Convert selected JSON to TypeScript and open the result in VS Code](assets/typescript.gif)

Optional properties marks every property with `?`; it does not infer optionality from one sample.

### JSON to JSON Schema

Generate a Draft 2020-12 schema from a JSON sample, including nested properties, required keys, and array item types. Empty arrays have unconstrained `items`. The schema reflects the sample: listed keys are required and additional properties are disallowed. Review it before using it as an API contract.

**Sort JSON Keys** alphabetizes object keys recursively and preserves array order.

## Results and privacy

- Selected text is replaced by default. Structured results also offer **Preview Diff**, **Open in New Editor**, and **Copy Result**.
- Set `selectcraft.defaultResultBehavior` to `"preview"` to compare changes and confirm before applying them.
- With no selection, JSON/YAML commands use the matching open document; other commands can use clipboard fallback and offer copy, insert-at-cursor, or open-in-new-editor options. Disable clipboard fallback in Settings if you prefer.
- Simple text actions apply independently to multiple selections. Validation leaves the editor unchanged.
- SelectCraft has no account, telemetry, analytics, or external API calls. It processes selected text or clipboard content only when you invoke a command.
- JWT decoding does not verify token signatures; decoded claims are not proof of authenticity.

## Settings

Search for **SelectCraft** in VS Code Settings, or add values to `settings.json`:

| Setting                                     | Default       | Purpose                                               |
| ------------------------------------------- | ------------- | ----------------------------------------------------- |
| `selectcraft.json.indentation`              | `"2"`         | JSON/TypeScript indentation: `"2"`, `"4"`, or `"tab"` |
| `selectcraft.smartAction.clipboardFallback` | `true`        | Read clipboard when no text is selected               |
| `selectcraft.defaultResultBehavior`         | `"replace"`   | `"replace"`, `"copy"`, `"ask"`, or `"preview"`        |
| `selectcraft.typescript.kind`               | `"interface"` | TypeScript declaration style                          |
| `selectcraft.typescript.rootName`           | `"Root"`      | Root declaration name                                 |
| `selectcraft.typescript.export`             | `false`       | Export generated declarations                         |
| `selectcraft.typescript.optionalProperties` | `false`       | Mark all generated properties optional                |

## Install locally

Requires **Node.js 20+**. Build and install the VSIX:

```sh
npm ci
npm run package
```

In VS Code, run **Extensions: Install from VSIX...** and select `selectcraft-1.0.0.vsix`. For development, open the project and press **F5** to launch an Extension Development Host.

## Development and releases

```sh
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build
```

Integration tests cover Smart Action, diff confirmation, TypeScript settings, JSON Schema, cursor insertion, multiple selections, and clipboard delivery. The [release workflow](.github/workflows/release.yml) tests, packages, publishes version tags to the VS Code Marketplace, and attaches the VSIX to a GitHub Release. Configure Marketplace credentials in GitHub Actions before the first release; no credentials belong in the repository.

## Support and license

Report bugs or request features in [GitHub Issues](https://github.com/LevKosyk/SelectCraft/issues). Licensed under [MIT](LICENSE). See [changelog.md](changelog.md) for release history.
