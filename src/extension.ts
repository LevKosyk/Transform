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
import { formatPath, jsonPathAt } from "./transforms/jsonc";
import { describeToken, HOVER_TOKEN_PATTERN } from "./services/hover";
import {
  applyRatingChoice,
  recordUse,
  reviewUrl,
  shouldAskForRating,
  type RatingChoice,
  type RatingState,
} from "./services/rating";
import type { InputType, ResultMode, TransformResult } from "./types";

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
  useDocument?: readonly string[];
}

const NO_INPUT_MESSAGE =
  "Transform: Select text or copy text to the clipboard first.";
const RESULT_PLACEHOLDER = "Where should Transform put the result?";

const SMART_DOCUMENTS = ["json", "jsonc", "json5", "yaml", "toml", "csv"];
const copyOnlyActions = new Set<ActionId>(["copyJwtPayload", "copyIsoDate"]);

const inputLabels: Record<InputType, string> = {
  json: "JSON",
  escapedJson: "Escaped JSON",
  json5: "JSON5 / JSONC",
  yaml: "YAML",
  toml: "TOML",
  csv: "CSV",
  jwt: "JWT",
  base64: "Base64",
  timestamp: "Timestamp",
  date: "Date",
  url: "URL",
  uuid: "UUID",
  text: "Text",
  unknown: "Generate",
};

interface ErrorAction {
  title: string;
  run: () => unknown;
}

interface TextLocation {
  line: number;
  column: number;
}

const RATING_KEY = "transform.rating";

let output: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext;
let lastJsonPath = "$";

function settings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("transform");
}

function logError(label: string, error: unknown): void {
  const details =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  output.appendLine(`[${new Date().toISOString()}] ${label}: ${details}`);
}

const showDetails: ErrorAction = {
  title: "Show Details",
  run: () => output.show(true),
};

function showError(message: string, actions: ErrorAction[] = []): void {
  void vscode.window
    .showErrorMessage(message, ...actions.map(({ title }) => title))
    .then((choice) => actions.find(({ title }) => title === choice)?.run());
}

function errorLocation(error: unknown, text: string): TextLocation | undefined {
  if (error && typeof error === "object") {
    const { line, column, lineNumber, columnNumber } = error as Record<
      string,
      unknown
    >;
    const errorLine = line ?? lineNumber;
    const errorColumn = column ?? columnNumber;
    if (typeof errorLine === "number" && typeof errorColumn === "number")
      return { line: errorLine, column: errorColumn };
  }
  const message = errorMessage(error);
  const lineColumn = /line (\d+),? column (\d+)/i.exec(message);
  if (lineColumn)
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  const position = /position (\d+)/i.exec(message);
  if (!position) {
    if (!(error instanceof SyntaxError)) return undefined;
    const result = validateJson(text);
    return !result.valid && result.line && result.column
      ? { line: result.line, column: result.column }
      : undefined;
  }
  const lines = text.slice(0, Number(position[1])).split(/\r\n|\n|\r/);
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

function goToError(
  document: vscode.TextDocument,
  start: vscode.Position,
  location: TextLocation | undefined,
): ErrorAction[] {
  if (!location) return [];
  return [
    {
      title: "Go to Error",
      run: async () => {
        const position =
          location.line === 1
            ? start.translate(0, location.column - 1)
            : new vscode.Position(
                start.line + location.line - 1,
                location.column - 1,
              );
        const editor = await vscode.window.showTextDocument(document);
        const target = document.validatePosition(position);
        editor.selection = new vscode.Selection(target, target);
        editor.revealRange(
          new vscode.Range(target, target),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
      },
    },
  ];
}

function inputErrorActions(input: InputContext, error: unknown): ErrorAction[] {
  const singleInput = (input.selectedTexts?.length ?? 1) <= 1;
  if (!input.editor || !input.selection || !singleInput) return [];
  return goToError(
    input.editor.document,
    input.selection.start,
    errorLocation(error, input.text),
  );
}

async function askForRating(state: RatingState): Promise<void> {
  const now = Date.now();
  await extensionContext.globalState.update(
    RATING_KEY,
    applyRatingChoice(state, "later", now),
  );
  const choices: Record<string, RatingChoice> = {
    "Rate Transform": "rate",
    Later: "later",
    "Don't Ask Again": "never",
  };
  const picked = await vscode.window.showInformationMessage(
    "Enjoying Transform? A quick rating helps other developers find it.",
    ...Object.keys(choices),
  );
  const choice = picked ? choices[picked] : undefined;
  await extensionContext.globalState.update(
    RATING_KEY,
    applyRatingChoice(state, choice, now),
  );
  if (choice === "rate")
    await vscode.env.openExternal(
      vscode.Uri.parse(
        reviewUrl(vscode.env.appName, extensionContext.extension.id),
      ),
    );
}

function recordSuccess(): void {
  if (extensionContext.extensionMode === vscode.ExtensionMode.Test) return;
  const now = Date.now();
  const state = recordUse(
    extensionContext.globalState.get<RatingState>(RATING_KEY),
    now,
  );
  void extensionContext.globalState.update(RATING_KEY, state);
  if (shouldAskForRating(state, now)) void askForRating(state);
}

async function copyResult(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage(
    "Transform: Result copied to clipboard.",
  );
}

function emptyInput(editor?: vscode.TextEditor): InputContext {
  return {
    text: "",
    editor,
    selections: editor?.selections,
    selectedTexts: editor?.selections.map(() => ""),
    source: "empty",
  };
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
  if (editor && useDocument?.includes(editor.document.languageId)) {
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
  if (allowEmpty) return emptyInput(editor);
  if (settings().get<boolean>("smartAction.clipboardFallback", true)) {
    const text = await vscode.env.clipboard.readText();
    if (text.trim()) return { text, editor, source: "clipboard" };
  }
  if (!silent) vscode.window.showInformationMessage(NO_INPUT_MESSAGE);
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function isJsonError(id: ActionId, error: unknown): boolean {
  return !!actionById(id).jsonInput && error instanceof SyntaxError;
}

function friendlyError(id: ActionId, error: unknown, text = ""): string {
  if (!isJsonError(id, error))
    return `Transform: ${actionById(id).label} failed. ${errorMessage(error)}`;
  const result = validateJson(text);
  if (result.valid || !result.line)
    return `Transform: Selected text is not valid JSON. ${errorMessage(error)}`;
  return `Transform: Invalid JSON at line ${result.line}, column ${result.column}. ${result.message}`;
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
    (mode === "replace" || context.source === "empty") &&
    context.selections?.length
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
    showError(
      "Transform: Could not update the editor. The document may be read-only or changed during the edit.",
    );
}

function readExecuteOptions(): ExecuteOptions {
  const config = settings();
  return {
    indentation: config.get<Indentation>("json.indentation", "2"),
    typescriptKind: config.get<"interface" | "type">(
      "typescript.kind",
      "interface",
    ),
    rootName: config.get<string>("codegen.rootName", "Root"),
    typescriptExport: config.get<boolean>("typescript.export", false),
    optionalProperties: config.get<boolean>(
      "codegen.optionalProperties",
      false,
    ),
  };
}

async function pickDateFormat(text: string): Promise<DateFormat | undefined> {
  let formats: ReturnType<typeof dateFormats>;
  try {
    formats = dateFormats(text);
  } catch (error) {
    showError(friendlyError("timestampToDate", error));
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

function showValidation(id: ActionId, input: InputContext): boolean {
  const { text } = input;
  if (id === "validateJson") {
    const result = validateJson(text);
    if (result.valid)
      vscode.window.showInformationMessage("Transform: JSON is valid.");
    else {
      const location = result.line
        ? ` at line ${result.line}, column ${result.column}`
        : "";
      showError(
        `Transform: JSON is invalid${location}. ${result.message}`,
        input.editor && input.selection && result.line && result.column
          ? goToError(input.editor.document, input.selection.start, {
              line: result.line,
              column: result.column,
            })
          : [],
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
      useDocument: action.documents,
    }));
  if (!input || showValidation(id, input)) return;
  const options = readExecuteOptions();
  if (id === "timestampToDate") {
    const dateFormat = await pickDateFormat(input.text);
    if (!dateFormat) return;
    options.dateFormat = dateFormat;
  }
  if (id === "queryJson") {
    const jsonPath = await vscode.window.showInputBox({
      title: "Transform: Query JSON Path",
      prompt: 'Supports .key, ["key"], [0], [-1], [*], .* and ..key',
      value: lastJsonPath,
      placeHolder: "$.users[*].email",
    });
    if (!jsonPath) return;
    options.jsonPath = lastJsonPath = jsonPath;
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
    if (!mode) return;
    await deliver(result, input, mode, multipleResults);
    recordSuccess();
  } catch (error) {
    logError(id, error);
    showError(friendlyError(id, error, input.text), [
      ...inputErrorActions(input, error),
      showDetails,
    ]);
  }
}

async function smartAction(): Promise<void> {
  const input = await getInput({ silent: true, useDocument: SMART_DOCUMENTS });
  if (!input) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage(NO_INPUT_MESSAGE);
      return;
    }
    const choice = await vscode.window.showQuickPick(
      relevantActions("unknown").map(({ label, id }) => ({ label, id })),
      { placeHolder: "Transform" },
    );
    if (choice) await runAction(choice.id, emptyInput(editor));
    return;
  }
  const type = detectInput(input.text);
  const choice = await vscode.window.showQuickPick(
    relevantActions(type).map(({ label, id }) => ({ label, id })),
    {
      placeHolder: `Transform · ${inputLabels[type]}`,
    },
  );
  if (choice) await runAction(choice.id, input);
}

async function copyJsonPath(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage(
      "Transform: Open a JSON document and place the cursor on a value.",
    );
    return;
  }
  const { document } = editor;
  let path: ReturnType<typeof jsonPathAt>;
  try {
    path = jsonPathAt(
      document.getText(),
      document.offsetAt(editor.selection.active),
    );
  } catch (error) {
    showError(
      `Transform: Could not read JSON at the cursor. ${errorMessage(error)}`,
      goToError(
        document,
        new vscode.Position(0, 0),
        errorLocation(error, document.getText()),
      ),
    );
    return;
  }
  if (!path) {
    vscode.window.showWarningMessage(
      "Transform: Place the cursor inside a JSON value.",
    );
    return;
  }
  const text = formatPath(path);
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage(`Transform: Copied ${text}`);
  recordSuccess();
}

const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    if (!settings().get<boolean>("hover.enabled", true)) return undefined;
    const range = document.getWordRangeAtPosition(
      position,
      HOVER_TOKEN_PATTERN,
    );
    const markdown = range && describeToken(document.getText(range));
    return markdown
      ? new vscode.Hover(new vscode.MarkdownString(markdown), range)
      : undefined;
  },
};

async function safelyRun(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logError("Unexpected error", error);
    showError(`Transform: Something went wrong. ${errorMessage(error)}`, [
      showDetails,
      {
        title: "Report Issue",
        run: () =>
          vscode.env.openExternal(
            vscode.Uri.parse(
              "https://github.com/LevKosyk/Transform/issues/new",
            ),
          ),
      },
    ]);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  output = vscode.window.createOutputChannel("Transform");
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("transform.smartAction", () =>
      safelyRun(smartAction),
    ),
    vscode.commands.registerCommand("transform.copyJsonPath", () =>
      safelyRun(copyJsonPath),
    ),
    vscode.languages.registerHoverProvider(
      [{ scheme: "file" }, { scheme: "untitled" }],
      hoverProvider,
    ),
    ...actions.map(({ id }) =>
      vscode.commands.registerCommand(`transform.${id}`, () =>
        safelyRun(() => runAction(id)),
      ),
    ),
  );
}

export function deactivate(): void {}
