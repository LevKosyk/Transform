# Contributing to Transform

Bug reports and feature requests are welcome in [GitHub Issues](https://github.com/LevKosyk/Transform/issues).

## Build from source

Requires **Node.js 20+**.

```sh
npm ci
npm run package
```

In VS Code, run **Extensions: Install from VSIX...** and select `transform-<version>.vsix`. For development, open the project and press **F5** to launch an Extension Development Host.

## Checks

```sh
npm run lint
npm run format:check
npm test
npm run build
npm run test:integration
```

Unit tests cover the transforms, detection, code generation, hover previews, and rating rules. Integration tests run in a real VS Code Extension Host and cover Smart Action, diff preview, settings, code generation, insertion, multiple selections and cursors, hover previews, JSON paths, error popups, and clipboard delivery.

## Releases

The [CI workflow](.github/workflows/ci.yml) runs on pushes and pull requests. Pushing a `v<version>` tag that matches `package.json` runs the [release workflow](.github/workflows/release.yml): it reruns CI, packages the VSIX, publishes to the VS Code Marketplace and, when the `OVSX_PAT` secret is set, to Open VSX (creating the publisher namespace on the first release and checking the token before anything is published), and creates a GitHub Release with the changelog section for that version.

Configure Marketplace credentials as the `VSCE_PAT` secret, or as `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` variables for Microsoft Entra ID. Credentials never belong in the repository.
