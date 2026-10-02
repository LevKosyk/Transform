import * as vscode from "vscode";
import { detectInput } from "./detection/detectInput";
import {
  actions,
  actionById,
  executeAction,
  relevantActions,
  type ActionId,
  type DateFormat,
  type ExecuteOptions,
} from "./services/actions";
import { validateJson, type Indentation } from "./transforms/json";
import { validateUuid } from "./transforms/uuid";
import { dateFormats } from "./transforms/dates";
import type { ResultMode, TransformResult } from "./types";

type DocumentLanguage = "json" | "yaml" | "jsonOrYaml";
type ResultBehavior = "replace" | "copy" | "ask" | "preview";

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
  useDocument?: DocumentLanguage;
}

const NO_INPUT_MESSAGE =
  "Transform: Select text or copy text to the clipboard first.";
const RESULT_PLACEHOLDER = "Where should Transform put the result?";

const jsonInputActions = new Set<ActionId>([
  "formatJson",
  "minifyJson",
  "sortJsonKeys",
  "jsonToYaml",
  "jsonToTypescript",
  "jsonToSchema",
]);
const jsonDocumentActions = new Set<ActionId>([
  ...jsonInputActions,
  "validateJson",
]);
const copyOnlyActions = new Set<ActionId>(["copyJwtPayload", "copyIsoDate"]);

let output: vscode.OutputChannel;

function settings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("selectcraft");
}

function documentLanguageFor(id: ActionId): DocumentLanguage | undefined {
  if (jsonDocumentActions.has(id)) return "json";
  if (id === "yamlToJson") return "yaml";
  return undefined;
}

function matchesLanguage(
  languageId: string,
  language: DocumentLanguage,
): boolean {
  return language === "jsonOrYaml"
    ? languageId === "json" || languageId === "yaml"
    : languageId === language;
}

function logError(label: string, error: unknown): void {
  const details =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  output.appendLine(`[${new Date().toISOString()}] ${label}: ${details}`);
}

async function copyResult(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage(
    "Transform: Result copied to clipboard.",
  );
}

async function getInput({
  allowEmpty = false,
  silent = false,
  useDocument,
}: InputOptions = {}): Promise<InputContext | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    const { document } = editor;
    const selections = editor.selections.filter(
      (selection) => !selection.isEmpty,
    );
    return {
      text: document.getText(editor.selection),
      editor,
      selection: editor.selection,
      selections,
      selectedTexts: selections.map((selection) => document.getText(selection)),
      documentVersion: document.version,
      source: "selection",
    };
  }
  if (
    editor &&
    useDocument &&
    matchesLanguage(editor.document.languageId, useDocument)
  ) {
    const { document } = editor;
    const text = document.getText();
    if (text.trim()) {
      const selection = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length),
      );
      return {
        text,
        editor,
        selection,
        selections: [selection],
        selectedTexts: [text],
        documentVersion: document.version,
        source: "document",
      };
    }
  }
  if (allowEmpty) return { text: "", editor, source: "empty" };
  if (settings().get<boolean>("smartAction.clipboardFallback", true)) {
    const text = await vscode.env.clipboard.readText();
    if (text.trim()) return { text, editor, source: "clipboard" };
  }
  if (!silent) vscode.window.showInformationMessage(NO_INPUT_MESSAGE);
  return undefined;
}

function friendlyError(id: ActionId, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return jsonInputActions.has(id)
    ? `Transform: Selected text is not valid JSON. ${message}`
    : `Transform: ${actionById(id).label} failed. ${message}`;
}

async function pickMode(
  items: { label: string; mode: ResultMode }[],
): Promise<ResultMode | undefined> {
  const choice = await vscode.window.showQuickPick(items, {
    placeHolder: RESULT_PLACEHOLDER,
  });
  return choice?.mode;
}

async function chooseMode(
  context: InputContext,
  structured: boolean,
): Promise<ResultMode | undefined> {
  if (context.source === "empty") return context.editor ? "insert" : "copy";
  if (context.source === "clipboard")
    return pickMode([
      { label: "Copy Result", mode: "copy" },
      ...(context.editor
        ? [{ label: "Insert Result at Cursor", mode: "insert" as const }]
        : []),
      { label: "Open Result in New Editor", mode: "open" },
    ]);
  const behavior = settings().get<ResultBehavior>(
    "defaultResultBehavior",
    "replace",
  );
  if (behavior === "preview") return "preview";
  if (structured || behavior === "ask")
    return pickMode([
      { label: "Replace Selection", mode: "replace" },
      { label: "Preview Diff…", mode: "preview" },
      { label: "Open in New Editor", mode: "open" },
      { label: "Copy Result", mode: "copy" },
    ]);
  return behavior === "copy" ? "copy" : "replace";
}

async function confirmPreview(
  result: TransformResult,
  context: InputContext,
  editor: vscode.TextEditor,
): Promise<boolean> {
  const { languageId } = editor.document;
  const [originalDocument, resultDocument] = await Promise.all([
    vscode.workspace.openTextDocument({
      content: context.selectedTexts?.join("\n") ?? context.text,
      language: languageId,
    }),
    vscode.workspace.openTextDocument({
      content: result.text,
      language: result.language ?? languageId,
    }),
  ]);
  await vscode.commands.executeCommand(
    "vscode.diff",
    originalDocument.uri,
    resultDocument.uri,
    "Transform: Preview Transformation",
  );
  const choice = await vscode.window.showQuickPick(
    ["Apply Result", "Copy Result", "Cancel"],
    { placeHolder: "Review the diff, then choose what to do with the result." },
  );
  if (choice === "Copy Result") {
    await copyResult(result.text);
    return false;
  }
  if (choice !== "Apply Result") return false;
  if (context.documentVersion !== editor.document.version) {
    vscode.window.showWarningMessage(
      "Transform: The source document changed while the diff was open. Run the action again to apply the result.",
    );
    return false;
  }
  return true;
}

async function deliver(
  result: TransformResult,
  context: InputContext,
  mode: ResultMode,
  replacementResults?: readonly TransformResult[],
): Promise<void> {
  if (mode === "copy") return copyResult(result.text);
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
      "Transform: Open an editor to insert the result.",
    );
    return;
  }
  let editor = context.editor;
  if (mode === "preview") {
    if (!(await confirmPreview(result, context, editor))) return;
    editor = await vscode.window.showTextDocument(editor.document, {
      preview: false,
    });
    mode = "replace";
  }
  const cursor = editor.selection.active;
  const ranges =
    mode === "replace" && context.selections?.length
      ? context.selections
      : [
          mode === "replace" && context.selection
            ? context.selection
            : new vscode.Range(cursor, cursor),
        ];
  const replacements =
    replacementResults?.length === ranges.length
      ? replacementResults
      : undefined;
  const success = await editor.edit((edit) => {
    ranges.forEach((range, index) =>
      edit.replace(range, (replacements?.[index] ?? result).text),
    );
  });
  if (!success)
    vscode.window.showErrorMessage("Transform: Could not update the editor.");
}

function readExecuteOptions(): ExecuteOptions {
  const config = settings();
  return {
    indentation: config.get<Indentation>("json.indentation", "2"),
    typescriptKind: config.get<"interface" | "type">(
      "typescript.kind",
      "interface",
    ),
    typescriptRootName: config.get<string>("typescript.rootName", "Root"),
    typescriptExport: config.get<boolean>("typescript.export", false),
    typescriptOptionalProperties: config.get<boolean>(
      "typescript.optionalProperties",
      false,
    ),
  };
}

async function pickDateFormat(text: string): Promise<DateFormat | undefined> {
  let formats: ReturnType<typeof dateFormats>;
  try {
    formats = dateFormats(text);
  } catch (error) {
    vscode.window.showWarningMessage(friendlyError("timestampToDate", error));
    return undefined;
  }
  const choice = await vscode.window.showQuickPick(
    [
      { label: `UTC: ${formats.utc}`, format: "utc" as const },
      { label: `Local: ${formats.local}`, format: "local" as const },
      { label: `Unix seconds: ${formats.seconds}`, format: "seconds" as const },
      {
        label: `Unix milliseconds: ${formats.milliseconds}`,
        format: "milliseconds" as const,
      },
    ],
    { placeHolder: "Choose a date format" },
  );
  return choice?.format;
}

function showValidation(id: ActionId, text: string): boolean {
  if (id === "validateJson") {
    const result = validateJson(text);
    if (result.valid)
      vscode.window.showInformationMessage("Transform: JSON is valid.");
    else {
      const location = result.line
        ? ` at line ${result.line}, column ${result.column}`
        : "";
      vscode.window.showWarningMessage(
        `Transform: JSON is invalid${location}. ${result.message}`,
      );
    }
    return true;
  }
  if (id === "validateUuid") {
    vscode.window.showInformationMessage(
      `Transform: UUID is ${validateUuid(text) ? "valid" : "invalid"}.`,
    );
    return true;
  }
  return false;
}

async function runAction(id: ActionId, context?: InputContext): Promise<void> {
  const action = actionById(id);
  const input =
    context ??
    (await getInput({
      allowEmpty: action.noInput,
      useDocument: documentLanguageFor(id),
    }));
  if (!input || showValidation(id, input.text)) return;
  const options = readExecuteOptions();
  if (id === "timestampToDate") {
    const dateFormat = await pickDateFormat(input.text);
    if (!dateFormat) return;
    options.dateFormat = dateFormat;
  }
  try {
    const { selectedTexts } = input;
    const multipleResults =
      selectedTexts && selectedTexts.length > 1 && !action.structured
        ? selectedTexts.map((text) => executeAction(id, text, options))
        : undefined;
    const result = multipleResults
      ? {
          ...multipleResults[0],
          text: multipleResults.map((item) => item.text).join("\n"),
        }
      : executeAction(id, input.text, options);
    const mode = copyOnlyActions.has(id)
      ? "copy"
      : await chooseMode(input, !!action.structured);
    if (mode) await deliver(result, input, mode, multipleResults);
  } catch (error) {
    logError(id, error);
    vscode.window.showWarningMessage(friendlyError(id, error));
  }
}

async function smartAction(): Promise<void> {
  const input = await getInput({ silent: true, useDocument: "jsonOrYaml" });
  if (!input) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage(NO_INPUT_MESSAGE);
      return;
    }
    const choice = await vscode.window.showQuickPick(
      [{ label: "Generate UUID v4", id: "generateUuid" as const }],
      { placeHolder: "Transform" },
    );
    if (choice)
      await runAction(choice.id, { text: "", editor, source: "empty" });
    return;
  }
  const type = detectInput(input.text);
  const choice = await vscode.window.showQuickPick(
    relevantActions(type).map(({ label, id }) => ({ label, id })),
    {
      placeHolder: `Transform · ${type === "text" ? "Text" : type.toUpperCase()}`,
    },
  );
  if (choice) await runAction(choice.id, input);
}

async function safelyRun(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logError("Unexpected error", error);
    vscode.window.showErrorMessage(
      "Transform: An unexpected error occurred. See the Transform output channel.",
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Transform");
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("selectcraft.smartAction", () =>
      safelyRun(smartAction),
    ),
    ...actions.map(({ id }) =>
      vscode.commands.registerCommand(`selectcraft.${id}`, () =>
        safelyRun(() => runAction(id)),
      ),
    ),
  );
}

export function deactivate(): void {}
