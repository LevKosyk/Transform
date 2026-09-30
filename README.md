# DevBox — Developer Toolbox

Everyday developer utilities inside VS Code. Select text, choose an action, and keep working in your editor. DevBox runs locally and works offline.

**Version:** 1.0.0 · **Requires:** VS Code 1.90 or newer

## Quick start

1. Select text in an editor.
2. Press **⌘⇧D** on macOS or **Ctrl+Shift+D** on Windows and Linux.
3. Choose an action and press **Enter**. DevBox places relevant actions first based on the selected text.

![Selecting JSON and opening DevBox Smart Action in VS Code](assets/smart.gif)

You can also open the Command Palette (**⌘⇧P** / **Ctrl+Shift+P**) and run **DevBox: Smart Action**. If a different extension uses the shortcut, the Command Palette always works.

### Editor context menu

Select text, right-click, open **DevBox**, and choose a command. The submenu appears only while text is selected. Every command is also available by name in the Command Palette.

## Core workflows

### Format JSON

Select `{"name":"Lev","active":true}` and run **Format JSON**. DevBox replaces the selection with indented JSON. Use **Minify JSON** for the reverse operation or **Validate JSON** to check syntax without changing the text.

### Generate TypeScript from JSON

Select a JSON object and run **JSON → TypeScript**. Choose **Interface** or **Type**, then choose **Replace Selection**, **Open in New Editor**, or **Copy Result**.

![Finding JSON to TypeScript in the DevBox action menu in VS Code](assets/typescript.gif)

For example, `{"user":{"id":1,"name":"Lev"}}` produces definitions for both the root object and its nested user. Arrays of objects share a definition; empty arrays use `unknown[]`.

### Decode a JWT

Select a JWT and run **Decode JWT** to inspect its header, payload, and any `exp`, `iat`, or `nbf` dates in UTC. **Copy JWT Payload** copies the payload JSON. Decoding does not verify the signature or establish that the token is authentic.

## Tools at a glance

| Input  | Available actions                                                                                |
| ------ | ------------------------------------------------------------------------------------------------ |
| JSON   | Format, minify, validate, convert to YAML or TypeScript                                          |
| YAML   | Convert to formatted JSON                                                                        |
| JWT    | Decode header and payload, copy payload, display token dates                                     |
| Base64 | Encode or decode UTF-8 text                                                                      |
| URL    | Encode or decode a component, parse a URL or query parameters                                    |
| Dates  | Convert Unix seconds, milliseconds, and ISO 8601 dates                                           |
| UUID   | Generate a UUID v4 or validate one                                                               |
| Text   | Convert to camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, lowercase, or UPPERCASE |

Validation commands show a notification and leave the editor unchanged. Invalid JSON errors include a line and column when available.

## Where results go

- **Selected text:** ordinary transformations replace the selection. Structured output such as TypeScript prompts for a destination.
- **No selection:** DevBox can read the clipboard after you invoke a command. It then offers **Copy Result**, **Insert Result at Cursor**, or **Open Result in New Editor**.
- **Generate UUID v4:** with no selection, DevBox inserts a new UUID at the cursor.

You can turn off clipboard fallback in Settings. DevBox reads the clipboard only when you invoke a command and no text is selected.

## Settings

Open Settings and search for **DevBox**, or edit `settings.json`:

| Setting                                | Default     | Options                        |
| -------------------------------------- | ----------- | ------------------------------ |
| `devbox.json.indentation`              | `"2"`       | `"2"`, `"4"`, `"tab"`          |
| `devbox.smartAction.clipboardFallback` | `true`      | `true`, `false`                |
| `devbox.defaultResultBehavior`         | `"replace"` | `"replace"`, `"copy"`, `"ask"` |

For example, to ask where each ordinary transformation should go:

```json
{
  "devbox.defaultResultBehavior": "ask"
}
```

## Install and run locally

For development you need **Node.js 20 or newer**:

```sh
npm install
npm run build
```

Open this folder in VS Code and press **F5**. VS Code opens a separate **Extension Development Host** window with DevBox loaded. After code changes, run **Developer: Reload Window** in that window.

To install a local build:

```sh
npm run package
```

In VS Code, run **Extensions: Install from VSIX...** and select `devbox-1.0.0.vsix` from the project folder.

## Troubleshooting

- **No action appears:** select text in an editor, then use **DevBox: Smart Action** from the Command Palette. If clipboard fallback is disabled, DevBox needs a selection.
- **The shortcut opens another command:** use the Command Palette or change the conflicting keybinding in VS Code.
- **A conversion fails:** check the selected data. For JSON, **DevBox: Validate JSON** reports the error location when available.

## Privacy and security

DevBox detects and transforms text on your computer. It has no account, analytics, telemetry, or external API calls. The YAML parser is bundled and loaded only when needed. JWT decoding is for inspection; it does not verify signatures.

## Development

```sh
npm test
npm run lint
npm run format:check
npm run build
npm run package
```

Transformations and input detection live in `src/transforms/` and `src/detection/`. `src/extension.ts` connects them to VS Code commands, menus, and result delivery.

## Automated releases

[The GitHub Actions release workflow](.github/workflows/release.yml) runs for tags such as `v1.0.0`. It checks that the tag matches `package.json`, runs lint, formatting, tests, and build, packages a VSIX, publishes to the VS Code Marketplace, and attaches the VSIX to a GitHub Release. It rewrites README GIF links to public, commit-specific URLs for the Marketplace.

Before your first release:

1. Create a VS Code Marketplace publisher and replace `devbox-placeholder` in `package.json` with its ID.
2. Push the project to a **public** GitHub repository so the GIFs are visible in the Marketplace.
3. Configure Marketplace credentials. For [Microsoft Entra ID with GitHub OIDC](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace), set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` as repository **Actions variables**, create a federated credential with subject `repo:OWNER/REPO:environment:marketplace`, and associate that identity with your Marketplace publisher. Alternatively, set a `VSCE_PAT` repository secret with **Marketplace (Manage)** scope.
4. Update the version in `package.json`, create the matching tag, and push it:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The workflow fails with an explanatory error if the version, publisher, or publishing credentials are missing. No credentials are stored in the repository.

## Support

If you find a bug or have a feature request, open an issue in the project's GitHub repository.

## License

MIT. See [LICENSE](LICENSE).
