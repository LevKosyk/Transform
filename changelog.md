# Changelog

All notable changes to Transform are documented here.

## Unreleased

- Renamed the extension's display name and visible branding to Transform while retaining its existing extension identifier and settings namespace.
- Added JSON sample to JSON Schema generation using Draft 2020-12.
- Added TypeScript generation settings for declaration kind, root name, exports, and optional properties.
- Added an optional diff preview before applying transformation results.
- Added integration coverage for Smart Action, insertion, new editor output, diff confirmation, and multiple selections.
- Applied simple text transformations independently to every editor selection.
- Added whole-document input for JSON and YAML commands when no text is selected.
- Added recursive JSON key sorting while preserving array order.

## 1.0.0

Initial release.

- Added context aware Smart Action for selected text.
- Added JSON formatting, validation, minification, and conversion to YAML or TypeScript.
- Added YAML to JSON, JWT inspection, Base64 and URL encoding, date and timestamp conversion, UUID tools, and text case conversion.
- Added local processing, clipboard fallback, editor context menu, and configurable result handling.
- Added unit tests, VS Code integration tests, and automated Marketplace release packaging.
