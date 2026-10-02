import type { Document, Node as YamlNode, Scalar } from "yaml";
import { indentValue, type Indentation } from "./json";
import { parseJsonc, type JsoncMember, type JsoncNode } from "./jsonc";
import { getYaml } from "./runtime";

function padFor(indentation: Indentation): string {
  const indent = indentValue(indentation);
  return typeof indent === "number" ? " ".repeat(indent) : indent;
}

function commentLines(
  comment: string | null | undefined,
  indent: string,
): string[] {
  if (!comment) return [];
  return comment
    .split("\n")
    .map((line) => (line.trim() ? `${indent}//${line}` : ""));
}

export function yamlToJsonc(
  input: string,
  indentation: Indentation = "2",
): string {
  const yaml = getYaml();
  const document = yaml.parseDocument(input, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  const pad = padFor(indentation);

  const plain = (value: unknown, indent: string): string =>
    (JSON.stringify(value, null, pad) ?? "null").replace(/\n/g, `\n${indent}`);

  function inlineComment(node: unknown): string {
    if (!yaml.isScalar(node) || !node.comment) return "";
    return ` //${node.comment.split("\n").join(" ")}`;
  }

  function write(node: unknown, indent: string): string {
    const inner = indent + pad;
    if (yaml.isMap(node) || yaml.isSeq(node)) {
      const map = yaml.isMap(node);
      const [open, close] = map ? ["{", "}"] : ["[", "]"];
      const lines = commentLines(node.commentBefore, inner);
      node.items.forEach((item, index) => {
        const comma = index < node.items.length - 1 ? "," : "";
        if (map) {
          const pair = item as { key: unknown; value: unknown };
          const key = yaml.isScalar(pair.key)
            ? String(pair.key.value)
            : String(pair.key);
          if (yaml.isNode(pair.key))
            lines.push(...commentLines(pair.key.commentBefore, inner));
          if (yaml.isScalar(pair.value))
            lines.push(...commentLines(pair.value.commentBefore, inner));
          lines.push(
            `${inner}${JSON.stringify(key)}: ${write(pair.value, inner)}${comma}${inlineComment(pair.value)}`,
          );
        } else {
          if (yaml.isScalar(item))
            lines.push(...commentLines(item.commentBefore, inner));
          lines.push(
            `${inner}${write(item, inner)}${comma}${inlineComment(item)}`,
          );
        }
      });
      lines.push(...commentLines(node.comment, inner));
      return lines.length
        ? `${open}\n${lines.join("\n")}\n${indent}${close}`
        : `${open}${close}`;
    }
    if (yaml.isAlias(node))
      return plain(node.resolve(document)?.toJS(document), indent);
    if (yaml.isNode(node)) return plain(node.toJS(document), indent);
    return "null";
  }

  return [
    ...commentLines(document.commentBefore, ""),
    write(document.contents, ""),
    ...commentLines(document.comment, ""),
  ].join("\n");
}

export function jsoncToYaml(input: string): string {
  const yaml = getYaml();
  const parsed = parseJsonc(input);
  const document: Document = new yaml.Document();
  const join = (comments: string[]) =>
    comments.length ? comments.join("\n") : undefined;

  function attach(member: JsoncMember, before: YamlNode, value: YamlNode) {
    const leading = join(member.leading);
    if (leading) before.commentBefore = leading;
    if (member.trailing === undefined) return;
    if (yaml.isScalar(value)) value.comment = member.trailing;
    else
      value.commentBefore = [member.trailing, value.commentBefore]
        .filter(Boolean)
        .join("\n");
  }

  function build(node: JsoncNode): YamlNode {
    if (node.kind === "scalar") return new yaml.Scalar(node.value);
    if (node.kind === "object") {
      const map = new yaml.YAMLMap();
      for (const entry of node.entries) {
        const key: Scalar = new yaml.Scalar(entry.key);
        const value = build(entry.value);
        attach(entry, key, value);
        map.items.push(new yaml.Pair(key, value));
      }
      map.comment = join(node.comments);
      return map;
    }
    const sequence = new yaml.YAMLSeq();
    for (const item of node.items) {
      const value = build(item.value);
      attach(item, value, value);
      sequence.items.push(value);
    }
    sequence.comment = join(node.comments);
    return sequence;
  }

  document.contents = build(parsed.root);
  document.commentBefore = join(parsed.leading) ?? null;
  document.comment = join(parsed.trailing) ?? null;
  return document.toString().trimEnd();
}
