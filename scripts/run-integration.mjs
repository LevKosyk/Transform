import { runTests } from "@vscode/test-electron";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(
  resolve(process.platform === "darwin" ? "/tmp" : tmpdir(), "sc-test-"),
);
const resultPath = resolve(temporary, "result.txt");
const macExecutable =
  "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
let vscodeExecutablePath = process.env.VSCODE_EXECUTABLE;
if (!vscodeExecutablePath && process.platform === "darwin") {
  try {
    await access(macExecutable);
    vscodeExecutablePath = macExecutable;
  } catch {
    // Download VS Code when the standard macOS installation is unavailable.
  }
}

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: resolve(root, "dist/integration.js"),
    vscodeExecutablePath,
    launchArgs: [
      "--disable-extensions",
      `--user-data-dir=${resolve(temporary, "user")}`,
      `--extensions-dir=${resolve(temporary, "extensions")}`,
    ],
    extensionTestsEnv: { TRANSFORM_TEST_RESULT: resultPath },
  });
  await access(resultPath).catch(() => {
    throw new Error("VS Code exited without running the integration tests.");
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
