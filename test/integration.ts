import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import * as vscode from "vscode";

async function selectedEditor(text: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content: text });
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(
    document.positionAt(0),
    document.positionAt(text.length),
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
  const configuration = vscode.workspace.getConfiguration("selectcraft");
  const configurableSettings = [
    "defaultResultBehavior",
    "typescript.kind",
    "typescript.rootName",
    "typescript.export",
    "typescript.optionalProperties",
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
    await vscode.commands.executeCommand("selectcraft.formatJson");
    assert.equal(
      jsonEditor.document.getText(),
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
    await vscode.commands.executeCommand("selectcraft.formatJson");
    assert.equal(
      wholeJsonDocument.getText(),
      '{\n  "active": true,\n  "count": 2\n}',
      "JSON commands should process the whole JSON document when nothing is selected",
    );

    const smartEditor = await selectedEditor('{"count":2}');
    restoreQuickPicks();
    const restoreSmartPick = interceptQuickPicks(chooseLabel("Format JSON"));
    await vscode.commands.executeCommand("selectcraft.smartAction");
    assert.equal(
      smartEditor.document.getText(),
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
    await vscode.commands.executeCommand("selectcraft.uppercase");
    assert.equal(
      previewEditor.document.getText(),
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
      "typescript.rootName",
      "ApiResponse",
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "typescript.export",
      true,
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "typescript.optionalProperties",
      true,
      vscode.ConfigurationTarget.Global,
    );
    const typescriptEditor = await selectedEditor('{"id":1,"name":"Ada"}');
    const restoreOpenPick = interceptQuickPicks(
      chooseLabel("Open in New Editor"),
    );
    await vscode.commands.executeCommand("selectcraft.jsonToTypescript");
    assert.match(
      vscode.window.activeTextEditor?.document.getText() ?? "",
      /export type ApiResponse = \{\n {2}id\?: number;\n {2}name\?: string;/,
      "TypeScript settings should control kind, root name, exports, and optional properties",
    );
    assert.equal(typescriptEditor.document.getText(), '{"id":1,"name":"Ada"}');
    restoreOpenPick();

    const schemaEditor = await selectedEditor('{"enabled":true,"items":[1,2]}');
    const restoreSchemaPick = interceptQuickPicks(
      chooseLabel("Open in New Editor"),
    );
    await vscode.commands.executeCommand("selectcraft.jsonToSchema");
    const schemaOutput =
      vscode.window.activeTextEditor?.document.getText() ?? "";
    assert.match(schemaOutput, /json-schema\.org\/draft\/2020-12\/schema/);
    const schema = JSON.parse(schemaOutput);
    assert.deepEqual(schema.properties.enabled, { type: "boolean" });
    assert.equal(
      schemaEditor.document.getText(),
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
    await vscode.commands.executeCommand("selectcraft.uppercase");
    assert.equal(
      insertionEditor.document.getText(),
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
    await vscode.commands.executeCommand("selectcraft.uppercase");
    assert.equal(
      multiEditor.document.getText(),
      "CAT DOG",
      "Transformations should apply independently to every selection",
    );

    await configuration.update(
      "defaultResultBehavior",
      "copy",
      vscode.ConfigurationTarget.Global,
    );
    const textEditor = await selectedEditor("hello world");
    await vscode.env.clipboard.writeText("integration-test-sentinel");
    await vscode.commands.executeCommand("selectcraft.uppercase");
    assert.equal(
      await vscode.env.clipboard.readText(),
      "HELLO WORLD",
      "UPPERCASE should copy the transformed selection",
    );
    assert.equal(
      textEditor.document.getText(),
      "hello world",
      "Copy mode should leave the editor unchanged",
    );

    console.log(
      "Transform integration tests passed (smart action, preview, TypeScript settings, JSON Schema, insertion, multiple selections, and clipboard).",
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
