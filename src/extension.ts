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
  source: "selection" | "document" | "clipboard" | "empty";
  selection?: vscode.Range;
  selections?: readonly vscode.Range[];
  selectedTexts?: readonly string[];
  documentVersion?: number;
}
interface InputOptions {
  allowEmpty?: boolean;
  silent?: boolean;
  useDocument?: "json" | "yaml" | "jsonOrYaml";
}
const jsonDocumentActions = new Set<ActionId>([
  "formatJson",
  "minifyJson",
  "sortJsonKeys",
  "validateJson",
  "jsonToYaml",
  "jsonToTypescript",
  "jsonToSchema",
]);
function settings() {
  return vscode.workspace.getConfiguration("selectcraft");
}
async function getInput({
  allowEmpty = false,
  silent = false,
  useDocument,
}: InputOptions = {}): Promise<InputContext | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    const selections = editor.selections.filter(
      (selection) => !selection.isEmpty,
    );
    return {
      text: editor.document.getText(editor.selection),
      editor,
      selection: editor.selection,
      selections,
      selectedTexts: selections.map((selection) =>
        editor.document.getText(selection),
      ),
      documentVersion: editor.document.version,
      source: "selection",
    };
  }
  const languageId = editor?.document.languageId;
  const matchesDocumentLanguage =
    useDocument === "jsonOrYaml"
      ? languageId === "json" || languageId === "yaml"
      : languageId === useDocument;
  if (editor && useDocument && matchesDocumentLanguage) {
    const text = editor.document.getText();
    if (text.trim()) {
      const selection = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(text.length),
      );
      return {
        text,
        editor,
        selection,
        selections: [selection],
        selectedTexts: [text],
        documentVersion: editor.document.version,
        source: "document",
      };
    }
  }
  if (allowEmpty) return { text: "", editor, source: "empty" };
  if (settings().get<boolean>("smartAction.clipboardFallback", true)) {
    const text = await vscode.env.clipboard.readText();
    if (text.trim()) return { text, editor, source: "clipboard" };
  }
  if (!silent)
    vscode.window.showInformationMessage(
      "SelectCraft: Select text or copy text to the clipboard first.",
    );
  return undefined;
}
function friendlyError(id: ActionId, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const subject = actionById(id).label;
  if (
    id === "formatJson" ||
    id === "minifyJson" ||
    id === "sortJsonKeys" ||
    id === "jsonToYaml" ||
    id === "jsonToTypescript" ||
    id === "jsonToSchema"
  )
    return `SelectCraft: Selected text is not valid JSON. ${message}`;
  return `SelectCraft: ${subject} failed. ${message}`;
}
async function chooseMode(
  context: InputContext,
  structured: boolean,
): Promise<ResultMode | undefined> {
  const defaultBehavior = settings().get<
    "replace" | "copy" | "ask" | "preview"
  >("defaultResultBehavior", "replace");
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
      { placeHolder: "Where should SelectCraft put the result?" },
    );
    return choice?.mode;
  }
  if (defaultBehavior === "preview") return "preview";
  if (structured || defaultBehavior === "ask") {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Replace Selection", mode: "replace" as ResultMode },
        { label: "Preview Diff…", mode: "preview" as ResultMode },
        { label: "Open in New Editor", mode: "open" as ResultMode },
        { label: "Copy Result", mode: "copy" as ResultMode },
      ],
      { placeHolder: "Where should SelectCraft put the result?" },
    );
    return choice?.mode;
  }
  return defaultBehavior === "copy" ? "copy" : "replace";
}
async function deliver(
  result: TransformResult,
  context: InputContext,
  mode: ResultMode,
  replacementResults?: readonly TransformResult[],
): Promise<void> {
  const previewing = mode === "preview";
  if (mode === "copy") {
    await vscode.env.clipboard.writeText(result.text);
    vscode.window.showInformationMessage(
      "SelectCraft: Result copied to clipboard.",
    );
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
      "SelectCraft: Open an editor to insert the result.",
    );
    return;
  }
  if (mode === "preview") {
    const original = context.selectedTexts?.join("\n") ?? context.text;
    const originalDocument = await vscode.workspace.openTextDocument({
      content: original,
      language: context.editor.document.languageId,
    });
    const resultDocument = await vscode.workspace.openTextDocument({
      content: result.text,
      language: result.language ?? context.editor.document.languageId,
    });
    await vscode.commands.executeCommand(
      "vscode.diff",
      originalDocument.uri,
      resultDocument.uri,
      "SelectCraft: Preview Transformation",
    );
    const choice = await vscode.window.showQuickPick(
      ["Apply Result", "Copy Result", "Cancel"],
      {
        placeHolder: "Review the diff, then choose what to do with the result.",
      },
    );
    if (choice === "Copy Result") {
      await vscode.env.clipboard.writeText(result.text);
      vscode.window.showInformationMessage(
        "SelectCraft: Result copied to clipboard.",
      );
      return;
    }
    if (choice !== "Apply Result") return;
    if (context.documentVersion !== context.editor.document.version) {
      vscode.window.showWarningMessage(
        "SelectCraft: The source document changed while the diff was open. Run the action again to apply the result.",
      );
      return;
    }
    mode = "replace";
  }
  const editor = previewing
    ? await vscode.window.showTextDocument(context.editor.document, {
        preview: false,
      })
    : context.editor;
  const range =
    mode === "replace" && context.selection
      ? context.selection
      : new vscode.Range(editor.selection.active, editor.selection.active);
  const ranges =
    mode === "replace" && context.selections?.length
      ? context.selections
      : [range];
  const replacements =
    replacementResults?.length === ranges.length
      ? replacementResults
      : ranges.map(() => result);
  const success = await editor.edit((edit) => {
    ranges.forEach((selection, index) =>
      edit.replace(selection, replacements[index].text),
    );
  });
  if (!success)
    vscode.window.showErrorMessage("SelectCraft: Could not update the editor.");
}
async function runAction(id: ActionId, context?: InputContext): Promise<void> {
  const action = actionById(id);
  const input =
    context ??
    (await getInput({
      allowEmpty: action.noInput,
      useDocument: jsonDocumentActions.has(id)
        ? "json"
        : id === "yamlToJson"
          ? "yaml"
          : undefined,
    }));
  if (!input) return;
  if (id === "validateJson") {
    const result = validateJson(input.text);
    if (result.valid)
      vscode.window.showInformationMessage("SelectCraft: JSON is valid.");
    else
      vscode.window.showWarningMessage(
        `SelectCraft: JSON is invalid${result.line ? ` at line ${result.line}, column ${result.column}` : ""}. ${result.message}`,
      );
    return;
  }
  if (id === "validateUuid") {
    vscode.window.showInformationMessage(
      `SelectCraft: UUID is ${validateUuid(input.text) ? "valid" : "invalid"}.`,
    );
    return;
  }
  const options: ExecuteOptions = {
    indentation: settings().get<Indentation>("json.indentation", "2"),
    typescriptKind: settings().get<"interface" | "type">(
      "typescript.kind",
      "interface",
    ),
    typescriptRootName: settings().get<string>("typescript.rootName", "Root"),
    typescriptExport: settings().get<boolean>("typescript.export", false),
    typescriptOptionalProperties: settings().get<boolean>(
      "typescript.optionalProperties",
      false,
    ),
  };
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
    const selectedTexts = input.selectedTexts;
    const multipleResults =
      selectedTexts && selectedTexts.length > 1 && !action.structured
        ? selectedTexts.map((text) => executeAction(id, text, options))
        : undefined;
    const result = timestampFormats
      ? { text: timestampFormats[options.dateFormat ?? "utc"] }
      : (multipleResults?.[0] ?? executeAction(id, input.text, options));
    const deliveredResult = multipleResults?.[0] ?? result;
    const mode =
      id === "copyJwtPayload" || id === "copyIsoDate"
        ? "copy"
        : await chooseMode(input, !!action.structured);
    if (mode)
      await deliver(
        multipleResults?.length
          ? {
              ...deliveredResult,
              text: multipleResults.map((item) => item.text).join("\n"),
            }
          : result,
        input,
        mode,
        multipleResults,
      );
  } catch (error) {
    output.appendLine(
      `[${new Date().toISOString()}] ${id}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    vscode.window.showWarningMessage(friendlyError(id, error));
  }
}
async function smartAction(): Promise<void> {
  const input = await getInput({ silent: true, useDocument: "jsonOrYaml" });
  if (!input) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const choice = await vscode.window.showQuickPick(
        [{ label: "Generate UUID v4", id: "generateUuid" as ActionId }],
        { placeHolder: "SelectCraft" },
      );
      if (choice)
        await runAction(choice.id, { text: "", editor, source: "empty" });
    } else
      vscode.window.showInformationMessage(
        "SelectCraft: Select text or copy text to the clipboard first.",
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
      placeHolder: `SelectCraft · ${type === "text" ? "Text" : type.toUpperCase()}`,
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
      "SelectCraft: An unexpected error occurred. See the SelectCraft output channel.",
    );
  }
}
export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("SelectCraft");
  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand("selectcraft.smartAction", () =>
      safelyRun(smartAction),
    ),
  );
  for (const action of actions) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`selectcraft.${action.id}`, () =>
        safelyRun(() => runAction(action.id)),
      ),
    );
  }
}
export function deactivate(): void {
  /* All resources are disposed by VS Code. */
}
