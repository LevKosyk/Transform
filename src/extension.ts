import * as vscode from "vscode";
import { detectInput } from "./detection/detectInput";
import {
  actions,
  actionById,
  executeAction,
  relevantActions,
  type ActionId,
  type ExecuteOptions,
} from "./services/actions";
import { validateJson, type Indentation } from "./transforms/json";
import { validateUuid } from "./transforms/uuid";
import { dateFormats } from "./transforms/dates";
import type { ResultMode, TransformResult } from "./types";

let output: vscode.OutputChannel;
interface InputContext {
  text: string;
  editor?: vscode.TextEditor;
  source: "selection" | "clipboard" | "empty";
  selection?: vscode.Selection;
}
function settings() {
  return vscode.workspace.getConfiguration("devbox");
}
async function getInput(
  allowEmpty = false,
  silent = false,
): Promise<InputContext | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty)
    return {
      text: editor.document.getText(editor.selection),
      editor,
      selection: editor.selection,
      source: "selection",
    };
  if (allowEmpty) return { text: "", editor, source: "empty" };
  if (settings().get<boolean>("smartAction.clipboardFallback", true)) {
    const text = await vscode.env.clipboard.readText();
    if (text.trim()) return { text, editor, source: "clipboard" };
  }
  if (!silent)
    vscode.window.showInformationMessage(
      "DevBox: Select text or copy text to the clipboard first.",
    );
  return undefined;
}
function friendlyError(id: ActionId, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const subject = actionById(id).label;
  if (
    id === "formatJson" ||
    id === "minifyJson" ||
    id === "jsonToYaml" ||
    id === "jsonToTypescript"
  )
    return `DevBox: Selected text is not valid JSON. ${message}`;
  return `DevBox: ${subject} failed. ${message}`;
}
async function chooseMode(
  context: InputContext,
  structured: boolean,
): Promise<ResultMode | undefined> {
  const defaultBehavior = settings().get<"replace" | "copy" | "ask">(
    "defaultResultBehavior",
    "replace",
  );
  if (context.source === "empty") return context.editor ? "insert" : "copy";
  if (context.source === "clipboard") {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Copy Result", mode: "copy" as ResultMode },
        ...(context.editor
          ? [{ label: "Insert Result at Cursor", mode: "insert" as ResultMode }]
          : []),
        { label: "Open Result in New Editor", mode: "open" as ResultMode },
      ],
      { placeHolder: "Where should DevBox put the result?" },
    );
    return choice?.mode;
  }
  if (structured || defaultBehavior === "ask") {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Replace Selection", mode: "replace" as ResultMode },
        { label: "Open in New Editor", mode: "open" as ResultMode },
        { label: "Copy Result", mode: "copy" as ResultMode },
      ],
      { placeHolder: "Where should DevBox put the result?" },
    );
    return choice?.mode;
  }
  return defaultBehavior === "copy" ? "copy" : "replace";
}
async function deliver(
  result: TransformResult,
  context: InputContext,
  mode: ResultMode,
): Promise<void> {
  if (mode === "copy") {
    await vscode.env.clipboard.writeText(result.text);
    vscode.window.showInformationMessage("DevBox: Result copied to clipboard.");
    return;
  }
  if (mode === "open") {
    const document = await vscode.workspace.openTextDocument({
      content: result.text,
      language: result.language ?? "plaintext",
    });
    await vscode.window.showTextDocument(document, { preview: false });
    return;
  }
  if (!context.editor) {
    vscode.window.showWarningMessage(
      "DevBox: Open an editor to insert the result.",
    );
    return;
  }
  const range =
    mode === "replace" && context.selection
      ? context.selection
      : new vscode.Range(
          context.editor.selection.active,
          context.editor.selection.active,
        );
  const success = await context.editor.edit((edit) =>
    edit.replace(range, result.text),
  );
  if (!success)
    vscode.window.showErrorMessage("DevBox: Could not update the editor.");
}
async function runAction(id: ActionId, context?: InputContext): Promise<void> {
  const action = actionById(id);
  const input = context ?? (await getInput(action.noInput));
  if (!input) return;
  if (id === "validateJson") {
    const result = validateJson(input.text);
    if (result.valid)
      vscode.window.showInformationMessage("DevBox: JSON is valid.");
    else
      vscode.window.showWarningMessage(
        `DevBox: JSON is invalid${result.line ? ` at line ${result.line}, column ${result.column}` : ""}. ${result.message}`,
      );
    return;
  }
  if (id === "validateUuid") {
    vscode.window.showInformationMessage(
      `DevBox: UUID is ${validateUuid(input.text) ? "valid" : "invalid"}.`,
    );
    return;
  }
  const options: ExecuteOptions = {
    indentation: settings().get<Indentation>("json.indentation", "2"),
  };
  if (id === "jsonToTypescript") {
    const choice = await vscode.window.showQuickPick(["Interface", "Type"], {
      placeHolder: "Generate TypeScript as…",
    });
    if (!choice) return;
    options.typescriptKind = choice === "Interface" ? "interface" : "type";
  }
  let timestampFormats: ReturnType<typeof dateFormats> | undefined;
  if (id === "timestampToDate") {
    try {
      timestampFormats = dateFormats(input.text);
    } catch (error) {
      vscode.window.showWarningMessage(friendlyError(id, error));
      return;
    }
    const formats = timestampFormats;
    const choice = await vscode.window.showQuickPick(
      [
        { label: `UTC: ${formats.utc}`, format: "utc" as const },
        { label: `Local: ${formats.local}`, format: "local" as const },
        {
          label: `Unix seconds: ${formats.seconds}`,
          format: "seconds" as const,
        },
        {
          label: `Unix milliseconds: ${formats.milliseconds}`,
          format: "milliseconds" as const,
        },
      ],
      { placeHolder: "Choose a date format" },
    );
    if (!choice) return;
    options.dateFormat = choice.format;
  }
  try {
    const result = timestampFormats
      ? { text: timestampFormats[options.dateFormat ?? "utc"] }
      : executeAction(id, input.text, options);
    const mode =
      id === "copyJwtPayload" || id === "copyIsoDate"
        ? "copy"
        : await chooseMode(input, !!action.structured);
    if (mode) await deliver(result, input, mode);
  } catch (error) {
    output.appendLine(
      `[${new Date().toISOString()}] ${id}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    vscode.window.showWarningMessage(friendlyError(id, error));
  }
}
async function smartAction(): Promise<void> {
  const input = await getInput(false, true);
  if (!input) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const choice = await vscode.window.showQuickPick(
        [{ label: "Generate UUID v4", id: "generateUuid" as ActionId }],
        { placeHolder: "DevBox" },
      );
      if (choice)
        await runAction(choice.id, { text: "", editor, source: "empty" });
    } else
      vscode.window.showInformationMessage(
        "DevBox: Select text or copy text to the clipboard first.",
      );
    return;
  }
  const type = detectInput(input.text);
  const choice = await vscode.window.showQuickPick(
    relevantActions(type).map((action) => ({
      label: action.label,
      id: action.id,
    })),
    {
      placeHolder: `DevBox · ${type === "text" ? "Text" : type.toUpperCase()}`,
    },
  );
  if (choice) await runAction(choice.id, input);
}
async function safelyRun(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    output.appendLine(
      `[${new Date().toISOString()}] Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    vscode.window.showErrorMessage(
      "DevBox: An unexpected error occurred. See the DevBox output channel.",
    );
  }
}
export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("DevBox");
  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand("devbox.smartAction", () =>
      safelyRun(smartAction),
    ),
  );
  for (const action of actions) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`devbox.${action.id}`, () =>
        safelyRun(() => runAction(action.id)),
      ),
    );
  }
}
export function deactivate(): void {
  /* All resources are disposed by VS Code. */
}
