type Punctuation = "{" | "}" | "[" | "]" | ":" | ",";
export type Scalar = string | number | boolean | null;

export type Token =
  | {
      type: "punct";
      value: Punctuation;
      start: number;
      end: number;
      line: number;
    }
  | { type: "value"; value: Scalar; start: number; end: number; line: number }
  | { type: "comment"; text: string; start: number; end: number; line: number };

export type JsoncNode =
  | { kind: "object"; entries: JsoncEntry[]; comments: string[] }
  | { kind: "array"; items: JsoncMember[]; comments: string[] }
  | { kind: "scalar"; value: Scalar };

export interface JsoncMember {
  leading: string[];
  trailing?: string;
  value: JsoncNode;
}

export interface JsoncEntry extends JsoncMember {
  key: string;
}

export interface JsoncDocument {
  leading: string[];
  root: JsoncNode;
  trailing: string[];
}

export type PathSegment = string | number;

const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const LITERAL_PATTERN = /true|false|null/y;
const LITERALS: Record<string, Scalar> = {
  true: true,
  false: false,
  null: null,
};
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

function syntaxError(text: string, offset: number, message: string): Error {
  const before = text.slice(0, offset).split(/\r\n|\n|\r/);
  return new Error(
    `${message} at line ${before.length}, column ${before.at(-1)!.length + 1}.`,
  );
}

export function tokenize(
  text: string,
  until = Infinity,
  strict = false,
): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let index = 0;
  while (index < text.length && index <= until) {
    const char = text[index];
    if (char === "\n") {
      line++;
      index++;
    } else if (char === " " || char === "\t" || char === "\r" || char === "﻿") {
      index++;
    } else if ("{}[]:,".includes(char)) {
      tokens.push({
        type: "punct",
        value: char as Punctuation,
        start: index,
        end: index + 1,
        line,
      });
      index++;
    } else if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        if (text[end] === "\n") break;
        end += text[end] === "\\" ? 2 : 1;
      }
      if (text[end] !== '"')
        throw syntaxError(text, index, "Unterminated string");
      let value: string;
      try {
        value = JSON.parse(text.slice(index, end + 1)) as string;
      } catch {
        throw syntaxError(text, index, "Invalid string escape");
      }
      tokens.push({ type: "value", value, start: index, end: end + 1, line });
      index = end + 1;
    } else if (strict && char === "/" && "/*".includes(text[index + 1])) {
      throw syntaxError(text, index, "Comments are not allowed in JSON");
    } else if (char === "/" && text[index + 1] === "/") {
      let end = text.indexOf("\n", index);
      if (end === -1) end = text.length;
      tokens.push({
        type: "comment",
        text: text.slice(index + 2, end).replace(/\r$/, ""),
        start: index,
        end,
        line,
      });
      index = end;
    } else if (char === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      if (close === -1) throw syntaxError(text, index, "Unterminated comment");
      const body = text.slice(index + 2, close);
      for (const part of body.split(/\r?\n/)) {
        const lineText = part.replace(/^\s*\*?/, "").trimEnd();
        tokens.push({
          type: "comment",
          text: lineText ? ` ${lineText.trimStart()}` : "",
          start: index,
          end: close + 2,
          line,
        });
      }
      line += body.split("\n").length - 1;
      index = close + 2;
    } else {
      NUMBER_PATTERN.lastIndex = index;
      LITERAL_PATTERN.lastIndex = index;
      const number = NUMBER_PATTERN.exec(text);
      const literal = number ? null : LITERAL_PATTERN.exec(text);
      const match = number ?? literal;
      if (!match)
        throw syntaxError(text, index, `Unexpected character "${char}"`);
      const end = index + match[0].length;
      tokens.push({
        type: "value",
        value: number ? Number(match[0]) : LITERALS[match[0]],
        start: index,
        end,
        line,
      });
      index = end;
    }
  }
  return tokens;
}

export function parseJsonc(text: string, strict = false): JsoncDocument {
  const tokens = tokenize(text, Infinity, strict);
  let position = 0;
  let lastLine = 0;

  const peek = (): Token | undefined => tokens[position];
  const next = (): Token => {
    const token = tokens[position++];
    if (!token) throw syntaxError(text, text.length, "Unexpected end of input");
    lastLine = token.line;
    return token;
  };
  const isPunct = (token: Token | undefined, value: Punctuation) =>
    token?.type === "punct" && token.value === value;
  const expect = (value: Punctuation): void => {
    const token = next();
    if (!isPunct(token, value))
      throw syntaxError(text, token.start, `Expected "${value}"`);
  };
  const takeComments = (): string[] => {
    const comments: string[] = [];
    while (peek()?.type === "comment")
      comments.push((next() as { text: string }).text);
    return comments;
  };
  const takeTrailing = (line: number): string | undefined => {
    const token = peek();
    if (token?.type !== "comment" || token.line !== line) return undefined;
    position++;
    return token.text;
  };

  function parseMembers<T extends JsoncMember>(
    close: Punctuation,
    member: (leading: string[]) => T,
  ): { members: T[]; comments: string[] } {
    const members: T[] = [];
    for (;;) {
      const leading = takeComments();
      if (isPunct(peek(), close)) {
        if (strict && members.length)
          throw syntaxError(
            text,
            tokens[position - 1].start,
            "Trailing commas are not allowed in JSON",
          );
        next();
        return { members, comments: leading };
      }
      const item = member(leading);
      const valueLine = lastLine;
      const hasComma = isPunct(peek(), ",");
      if (hasComma) next();
      item.trailing = takeTrailing(valueLine);
      members.push(item);
      if (!hasComma) {
        const comments = takeComments();
        expect(close);
        return { members, comments };
      }
    }
  }

  function parseValue(): JsoncNode {
    const token = next();
    if (token.type === "value") return { kind: "scalar", value: token.value };
    if (isPunct(token, "{")) {
      const { members, comments } = parseMembers<JsoncEntry>("}", (leading) => {
        const key = next();
        if (key.type !== "value" || typeof key.value !== "string")
          throw syntaxError(text, key.start, "Expected a property name");
        leading.push(...takeComments());
        expect(":");
        leading.push(...takeComments());
        return { key: key.value, leading, value: parseValue() };
      });
      return { kind: "object", entries: members, comments };
    }
    if (isPunct(token, "[")) {
      const { members, comments } = parseMembers<JsoncMember>(
        "]",
        (leading) => ({
          leading,
          value: parseValue(),
        }),
      );
      return { kind: "array", items: members, comments };
    }
    throw syntaxError(
      text,
      token.start,
      `Unexpected "${text.slice(token.start, token.end)}"`,
    );
  }

  const leading = takeComments();
  const root = parseValue();
  const trailing = takeComments();
  const extra = peek();
  if (extra)
    throw syntaxError(text, extra.start, "Unexpected content after JSON");
  return { leading, root, trailing };
}

export function jsoncToValue(node: JsoncNode): unknown {
  if (node.kind === "scalar") return node.value;
  if (node.kind === "array")
    return node.items.map((item) => jsoncToValue(item.value));
  const object: Record<string, unknown> = {};
  for (const entry of node.entries)
    object[entry.key] = jsoncToValue(entry.value);
  return object;
}

export function formatPath(path: readonly PathSegment[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    return IDENTIFIER_PATTERN.test(segment)
      ? `${result}.${segment}`
      : `${result}[${JSON.stringify(segment)}]`;
  }, "$");
}

export function jsonPathAt(
  text: string,
  offset: number,
): PathSegment[] | undefined {
  type Frame = {
    kind: "object" | "array";
    key?: PathSegment;
    expectKey: boolean;
  };
  const frames: Frame[] = [];
  const currentPath = (): PathSegment[] =>
    frames.flatMap((frame) => (frame.key === undefined ? [] : [frame.key]));
  let found: PathSegment[] | undefined;
  for (const token of tokenize(text, offset)) {
    if (token.type === "comment") continue;
    const top = frames.at(-1);
    let path: PathSegment[];
    if (token.type === "punct") {
      switch (token.value) {
        case "{":
        case "[":
          path = currentPath();
          frames.push(
            token.value === "{"
              ? { kind: "object", expectKey: true }
              : { kind: "array", key: 0, expectKey: false },
          );
          break;
        case "}":
        case "]":
          frames.pop();
          path = currentPath();
          break;
        case ",":
          if (top?.kind === "object") {
            top.key = undefined;
            top.expectKey = true;
          } else if (top) top.key = (top.key as number) + 1;
          path = currentPath();
          break;
        case ":":
          if (top) top.expectKey = false;
          path = currentPath();
          break;
      }
    } else {
      if (
        top?.kind === "object" &&
        top.expectKey &&
        typeof token.value === "string"
      )
        top.key = token.value;
      path = currentPath();
    }
    found = path!;
  }
  return found;
}
