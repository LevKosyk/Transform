import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import * as vscode from "vscode";

async function selectedEditor(text: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content: text });
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(
    document.positionAt(0),
    document.lineAt(document.lineCount - 1).range.end,
  );
  return editor;
}

function interceptQuickPicks(
  choose: (items: readonly unknown[]) => unknown,
): () => void {
  const previous = Object.getOwnPropertyDescriptor(
    vscode.window,
    "showQuickPick",
  );
  Object.defineProperty(vscode.window, "showQuickPick", {
    configurable: true,
    value: async (items: readonly unknown[]) => choose(items),
  });
  return () => {
    if (previous)
      Object.defineProperty(vscode.window, "showQuickPick", previous);
    else
      delete (vscode.window as unknown as Record<string, unknown>)[
        "showQuickPick"
      ];
  };
}

function interceptInputBox(value: string): () => void {
  const previous = Object.getOwnPropertyDescriptor(
    vscode.window,
    "showInputBox",
  );
  Object.defineProperty(vscode.window, "showInputBox", {
    configurable: true,
    value: async () => value,
  });
  return () => {
    if (previous)
      Object.defineProperty(vscode.window, "showInputBox", previous);
    else
      delete (vscode.window as unknown as Record<string, unknown>)[
        "showInputBox"
      ];
  };
}

function interceptErrorMessage(
  choose: (message: string) => string | undefined,
): () => void {
  const previous = Object.getOwnPropertyDescriptor(
    vscode.window,
    "showErrorMessage",
  );
  Object.defineProperty(vscode.window, "showErrorMessage", {
    configurable: true,
    value: async (message: string) => choose(message),
  });
  return () => {
    if (previous)
      Object.defineProperty(vscode.window, "showErrorMessage", previous);
    else
      delete (vscode.window as unknown as Record<string, unknown>)[
        "showErrorMessage"
      ];
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !condition(); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
}

function textOf(document: vscode.TextDocument | undefined): string {
  return document?.getText().replace(/\r\n/g, "\n") ?? "";
}

function chooseLabel(label: string) {
  return (items: readonly unknown[]) => {
    const choice = items.find((item) => {
      if (typeof item === "string") return item === label;
      return (
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        item.label === label
      );
    });
    assert.ok(choice, `Expected quick pick to contain “${label}”`);
    return choice;
  };
}

export async function run(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("transform");
  const configurableSettings = [
    "defaultResultBehavior",
    "typescript.kind",
    "codegen.rootName",
    "typescript.export",
    "codegen.optionalProperties",
  ] as const;
  const originalSettings = new Map(
    configurableSettings.map((key) => [
      key,
      configuration.inspect(key)?.globalValue,
    ]),
  );
  const originalClipboard = await vscode.env.clipboard.readText();
  const restoreQuickPicks = interceptQuickPicks(chooseLabel("Apply Result"));

  try {
    await configuration.update(
      "defaultResultBehavior",
      "replace",
      vscode.ConfigurationTarget.Global,
    );
    const jsonEditor = await selectedEditor('{"name":"Lev","active":true}');
    await vscode.commands.executeCommand("transform.formatJson");
    assert.equal(
      textOf(jsonEditor.document),
      '{\n  "name": "Lev",\n  "active": true\n}',
      "Format JSON should replace the selected text in the editor",
    );

    const wholeJsonDocument = await vscode.workspace.openTextDocument({
      content: '{"active":true,"count":2}',
      language: "json",
    });
    const wholeJsonEditor =
      await vscode.window.showTextDocument(wholeJsonDocument);
    wholeJsonEditor.selection = new vscode.Selection(
      wholeJsonDocument.positionAt(0),
      wholeJsonDocument.positionAt(0),
    );
    await vscode.env.clipboard.writeText("clipboard must not be used");
    await vscode.commands.executeCommand("transform.formatJson");
    assert.equal(
      textOf(wholeJsonDocument),
      '{\n  "active": true,\n  "count": 2\n}',
      "JSON commands should process the whole JSON document when nothing is selected",
    );

    const smartEditor = await selectedEditor('{"count":2}');
    restoreQuickPicks();
    const restoreSmartPick = interceptQuickPicks(chooseLabel("Format JSON"));
    await vscode.commands.executeCommand("transform.smartAction");
    assert.equal(
      textOf(smartEditor.document),
      '{\n  "count": 2\n}',
      "Smart Action should detect JSON and run the selected action",
    );
    restoreSmartPick();

    await configuration.update(
      "defaultResultBehavior",
      "preview",
      vscode.ConfigurationTarget.Global,
    );
    const restorePreviewPick = interceptQuickPicks(chooseLabel("Apply Result"));
    const previewEditor = await selectedEditor("preview me");
    await vscode.commands.executeCommand("transform.uppercase");
    assert.equal(
      textOf(previewEditor.document),
      "PREVIEW ME",
      "Preview mode should apply the result after confirmation",
    );
    restorePreviewPick();

    await configuration.update(
      "defaultResultBehavior",
      "replace",
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "typescript.kind",
      "type",
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "codegen.rootName",
      "ApiResponse",
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "typescript.export",
      true,
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "codegen.optionalProperties",
      true,
      vscode.ConfigurationTarget.Global,
    );
    const typescriptEditor = await selectedEditor('{"id":1,"name":"Ada"}');
    const restoreOpenPick = interceptQuickPicks(
      chooseLabel("Open in New Editor"),
    );
    await vscode.commands.executeCommand("transform.jsonToTypescript");
    assert.match(
      textOf(vscode.window.activeTextEditor?.document),
      /export type ApiResponse = \{\n {2}id\?: number;\n {2}name\?: string;/,
      "TypeScript settings should control kind, root name, exports, and optional properties",
    );
    assert.equal(textOf(typescriptEditor.document), '{"id":1,"name":"Ada"}');
    restoreOpenPick();

    const schemaEditor = await selectedEditor('{"enabled":true,"items":[1,2]}');
    const restoreSchemaPick = interceptQuickPicks(
      chooseLabel("Open in New Editor"),
    );
    await vscode.commands.executeCommand("transform.jsonToSchema");
    const schemaOutput = textOf(vscode.window.activeTextEditor?.document);
    assert.match(schemaOutput, /json-schema\.org\/draft\/2020-12\/schema/);
    const schema = JSON.parse(schemaOutput);
    assert.deepEqual(schema.properties.enabled, { type: "boolean" });
    assert.equal(
      textOf(schemaEditor.document),
      '{"enabled":true,"items":[1,2]}',
    );
    restoreSchemaPick();

    const insertionDocument = await vscode.workspace.openTextDocument({
      content: "start end",
    });
    const insertionEditor =
      await vscode.window.showTextDocument(insertionDocument);
    insertionEditor.selection = new vscode.Selection(
      insertionDocument.positionAt(6),
      insertionDocument.positionAt(6),
    );
    await vscode.env.clipboard.writeText("middle");
    const restoreInsertPick = interceptQuickPicks(
      chooseLabel("Insert Result at Cursor"),
    );
    await vscode.commands.executeCommand("transform.uppercase");
    assert.equal(
      textOf(insertionEditor.document),
      "start MIDDLEend",
      "Insert Result should insert clipboard transformations at the cursor",
    );
    restoreInsertPick();

    const multiEditor = await selectedEditor("cat dog");
    multiEditor.selections = [
      new vscode.Selection(
        multiEditor.document.positionAt(0),
        multiEditor.document.positionAt(3),
      ),
      new vscode.Selection(
        multiEditor.document.positionAt(4),
        multiEditor.document.positionAt(7),
      ),
    ];
    await vscode.commands.executeCommand("transform.uppercase");
    assert.equal(
      textOf(multiEditor.document),
      "CAT DOG",
      "Transformations should apply independently to every selection",
    );

    const cursorsDocument = await vscode.workspace.openTextDocument({
      content: "a\nb\nc",
    });
    const cursorsEditor = await vscode.window.showTextDocument(cursorsDocument);
    cursorsEditor.selections = [0, 1, 2].map((line) => {
      const end = cursorsDocument.lineAt(line).range.end;
      return new vscode.Selection(end, end);
    });
    await vscode.commands.executeCommand("transform.generateUuidV7");
    const generated = textOf(cursorsEditor.document)
      .split("\n")
      .map((line) => line.slice(1));
    assert.ok(
      generated.every((id) => /^[0-9a-f-]{36}$/.test(id)),
      `Every cursor should receive a UUID: ${generated.join(", ")}`,
    );
    assert.equal(
      new Set(generated).size,
      3,
      "Each cursor should receive a different UUID",
    );

    const hoverDocument = await vscode.workspace.openTextDocument({
      content: "const createdAt = 1767225600;",
    });
    await vscode.window.showTextDocument(hoverDocument);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      hoverDocument.uri,
      hoverDocument.positionAt(22),
    );
    const hoverText = hovers
      .flatMap((hover) => hover.contents)
      .map((content) => (typeof content === "string" ? content : content.value))
      .join("\n");
    assert.match(
      hoverText,
      /Transform · Unix seconds[\s\S]*2026-01-01T00:00:00\.000Z/,
      "Hovering a Unix timestamp should show the decoded date",
    );

    const pathDocument = await vscode.workspace.openTextDocument({
      language: "json",
      content: '{"users":[{"email":"a@x.io"},{"email":"l@x.io"}]}',
    });
    const pathEditor = await vscode.window.showTextDocument(pathDocument);
    const emailOffset = pathDocument.getText().indexOf("l@x.io");
    pathEditor.selection = new vscode.Selection(
      pathDocument.positionAt(emailOffset),
      pathDocument.positionAt(emailOffset),
    );
    await vscode.commands.executeCommand("transform.copyJsonPath");
    assert.equal(
      await vscode.env.clipboard.readText(),
      "$.users[1].email",
      "Copy JSON Path should copy the path at the cursor",
    );

    const restoreInputBox = interceptInputBox("$.users[*].email");
    const restoreQueryPick = interceptQuickPicks(
      chooseLabel("Open in New Editor"),
    );
    await vscode.commands.executeCommand("transform.queryJson");
    assert.deepEqual(
      JSON.parse(textOf(vscode.window.activeTextEditor?.document)),
      ["a@x.io", "l@x.io"],
      "Query JSON Path should run the entered query against the JSON document",
    );
    restoreQueryPick();
    restoreInputBox();

    const brokenText = '{\n  "a": 1,\n  "b": \n}';
    const brokenEditor = await selectedEditor(brokenText);
    let errorMessage = "";
    const restoreErrorPopup = interceptErrorMessage((message) => {
      errorMessage = message;
      return "Go to Error";
    });
    await vscode.commands.executeCommand("transform.formatJson");
    await waitFor(() => brokenEditor.selection.isEmpty);
    restoreErrorPopup();
    assert.match(
      errorMessage,
      /Invalid JSON at line 4, column 1\. Unexpected "\}"/,
      "Invalid JSON should show an error popup with the location",
    );
    assert.deepEqual(
      [
        brokenEditor.selection.active.line,
        brokenEditor.selection.active.character,
      ],
      [3, 0],
      "Go to Error should move the cursor to the invalid token",
    );
    assert.equal(textOf(brokenEditor.document), brokenText);

    await selectedEditor('{"id":1}');
    const restoreZodPick = interceptQuickPicks(
      chooseLabel("Open in New Editor"),
    );
    await vscode.commands.executeCommand("transform.jsonToZod");
    const zodEditor = vscode.window.activeTextEditor;
    assert.equal(zodEditor?.document.languageId, "typescript");
    assert.match(
      textOf(zodEditor?.document),
      /export const ApiResponseSchema = z\.object\(\{\n {2}id: z\.number\(\)\.int\(\)\.optional\(\),/,
      "Zod generation should honor the root name and optional settings",
    );
    restoreZodPick();

    await configuration.update(
      "defaultResultBehavior",
      "copy",
      vscode.ConfigurationTarget.Global,
    );
    const textEditor = await selectedEditor("hello world");
    await vscode.env.clipboard.writeText("integration-test-sentinel");
    await vscode.commands.executeCommand("transform.uppercase");
    assert.equal(
      await vscode.env.clipboard.readText(),
      "HELLO WORLD",
      "UPPERCASE should copy the transformed selection",
    );
    assert.equal(
      textOf(textEditor.document),
      "hello world",
      "Copy mode should leave the editor unchanged",
    );

    console.log(
      "Transform integration tests passed (smart action, preview, TypeScript settings, JSON Schema, insertion, multiple selections, multi-cursor generation, hover, JSON paths, Zod, error popups, and clipboard).",
    );
    if (process.env.TRANSFORM_TEST_RESULT)
      await writeFile(process.env.TRANSFORM_TEST_RESULT, "passed\n");
  } finally {
    await vscode.env.clipboard.writeText(originalClipboard);
    restoreQuickPicks();
    for (const [key, value] of originalSettings)
      await configuration.update(key, value, vscode.ConfigurationTarget.Global);
  }
}
