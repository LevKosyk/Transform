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

export async function run(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("selectcraft");
  const originalBehavior = configuration.inspect(
    "defaultResultBehavior",
  )?.globalValue;
  const originalClipboard = await vscode.env.clipboard.readText();

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

    console.log("SelectCraft integration tests passed (editor and clipboard).");
    if (process.env.SELECTCRAFT_TEST_RESULT)
      await writeFile(process.env.SELECTCRAFT_TEST_RESULT, "passed\n");
  } finally {
    await vscode.env.clipboard.writeText(originalClipboard);
    await configuration.update(
      "defaultResultBehavior",
      originalBehavior,
      vscode.ConfigurationTarget.Global,
    );
  }
}
