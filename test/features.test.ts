import { describe, expect, it } from "vitest";
import {
  jsonToGo,
  jsonToPython,
  jsonToRust,
  jsonToZod,
} from "../src/transforms/codegen";
import {
  csvToJson,
  json5ToJson,
  jsonToCsv,
  jsonToJson5,
  jsonToToml,
  tomlToJson,
} from "../src/transforms/formats";
import { jsoncToYaml, yamlToJsonc } from "../src/transforms/yamlJsonc";
import { formatPath, jsonPathAt, parseJsonc } from "../src/transforms/jsonc";
import { queryJson } from "../src/transforms/jsonPath";
import { describeToken } from "../src/services/hover";
import { detectInput } from "../src/detection/detectInput";
import { relativeTime } from "../src/transforms/dates";
import { executeAction, relevantActions } from "../src/services/actions";
import { validateJson } from "../src/transforms/json";
import {
  applyRatingChoice,
  recordUse,
  reviewUrl,
  shouldAskForRating,
  type RatingState,
} from "../src/services/rating";

const sample = JSON.stringify({
  userId: 1,
  "display-name": "Ada",
  type: "admin",
  score: 9.5,
  address: { zip: null },
  items: [{ id: 1 }, { id: 2 }],
  mixed: [1, "x"],
});

describe("code generation", () => {
  it("generates Zod schemas with inferred types", () => {
    const output = jsonToZod(sample);
    expect(output.startsWith('import { z } from "zod";')).toBe(true);
    expect(output).toContain("export const AddressSchema = z.object({");
    expect(output).toContain("  zip: z.null(),");
    expect(output).toContain("  userId: z.number().int(),");
    expect(output).toContain('  "display-name": z.string(),');
    expect(output).toContain("  score: z.number(),");
    expect(output).toContain("  items: z.array(ItemsSchema),");
    expect(output).toContain(
      "  mixed: z.array(z.union([z.number().int(), z.string()])),",
    );
    expect(output).toContain("export type Root = z.infer<typeof RootSchema>;");
    expect(output.indexOf("ItemsSchema =")).toBeLessThan(
      output.indexOf("RootSchema ="),
    );
  });
  it("generates aligned Go structs with initialisms and tags", () => {
    const output = jsonToGo(sample);
    expect(output.startsWith("type Root struct {")).toBe(true);
    expect(output).toContain('\tUserID      int64   `json:"userId"`');
    expect(output).toContain('\tDisplayName string  `json:"display-name"`');
    expect(output).toContain('\tItems       []Items `json:"items"`');
    expect(output).toContain('\tMixed       []any   `json:"mixed"`');
    expect(output).toContain('\tID int64 `json:"id"`');
    expect(jsonToGo('{"a":1}', { optionalProperties: true })).toContain(
      '`json:"a,omitempty"`',
    );
    expect(jsonToGo('[{"id":1}]')).toBe(
      'type Root []Item\n\ntype Item struct {\n\tID int64 `json:"id"`\n}',
    );
  });
  it("generates Pydantic models with aliases and keywords", () => {
    const output = jsonToPython(sample);
    expect(output.startsWith("from pydantic import BaseModel, Field")).toBe(
      true,
    );
    expect(output).toContain('    user_id: int = Field(alias="userId")');
    expect(output).toContain(
      '    display_name: str = Field(alias="display-name")',
    );
    expect(output).toContain("    mixed: list[int | str]");
    expect(output.indexOf("class Items")).toBeLessThan(
      output.indexOf("class Root"),
    );
    expect(
      jsonToPython('{"class":"x"}', { optionalProperties: true }),
    ).toContain('    class_: str | None = Field(default=None, alias="class")');
    expect(jsonToPython("[1]")).toContain("class Root(RootModel[list[int]]):");
  });
  it("generates serde structs with renames and raw identifiers", () => {
    const output = jsonToRust(sample);
    expect(output.startsWith("use serde::{Deserialize, Serialize};")).toBe(
      true,
    );
    expect(output).toContain(
      '    #[serde(rename = "userId")]\n    pub user_id: i64,',
    );
    expect(output).toContain("    pub r#type: String,");
    expect(output).toContain("    pub zip: Option<serde_json::Value>,");
    expect(output).toContain("    pub mixed: Vec<serde_json::Value>,");
    expect(jsonToRust('{"a":1}', { optionalProperties: true })).toContain(
      '    #[serde(default, skip_serializing_if = "Option::is_none")]\n    pub a: Option<i64>,',
    );
  });
});

describe("data formats", () => {
  it("converts JSON to CSV with flattening and quoting", () => {
    const csv = jsonToCsv(
      '[{"name":"Ada, L","address":{"city":"London"},"tags":["x"]},{"name":"Alan \\"T\\"","active":true}]',
    );
    expect(csv).toBe(
      'name,address.city,tags,active\n"Ada, L",London,"[""x""]",\n"Alan ""T""",,,true',
    );
  });
  it("converts CSV to JSON with type inference and delimiter detection", () => {
    expect(
      JSON.parse(csvToJson('id,name,ok\n1,"A, B",true\n2,"x\ny",null')),
    ).toEqual([
      { id: 1, name: "A, B", ok: true },
      { id: 2, name: "x\ny", ok: null },
    ]);
    expect(JSON.parse(csvToJson("a;b\r\n007;x"))).toEqual([
      { a: "007", b: "x" },
    ]);
    expect(JSON.parse(csvToJson("a\tb\n1\t2"))).toEqual([{ a: 1, b: 2 }]);
    expect(() => csvToJson("a,b\n1")).toThrow(/row 2 has 1 fields/);
  });
  it("converts between JSON and TOML", () => {
    expect(jsonToToml('{"title":"T","owner":{"name":"Lev"}}')).toBe(
      'title = "T"\n\n[owner]\nname = "Lev"',
    );
    expect(
      JSON.parse(tomlToJson('title = "T"\n[owner]\nname = "Lev"')),
    ).toEqual({
      title: "T",
      owner: { name: "Lev" },
    });
    expect(() => jsonToToml("[1]")).toThrow(/object at the top level/);
    expect(() => jsonToToml('{"a":null}')).toThrow(/no null value/);
  });
  it("converts between JSON and JSON5/JSONC", () => {
    expect(jsonToJson5('{"a":1,"b-c":"x"}')).toBe(
      "{\n  a: 1,\n  'b-c': 'x',\n}",
    );
    expect(JSON.parse(json5ToJson("{a: 1, // comment\n b: [1,],}"))).toEqual({
      a: 1,
      b: [1],
    });
  });
});

describe("YAML and JSONC with comments", () => {
  const yaml = `# Service config
server:
  # Port to listen on
  port: 3000 # default
  hosts:
    # primary first
    - a.com # main
    - b.com
# end of file`;
  const jsonc = `{
  // Service config
  "server": {
    // Port to listen on
    "port": 3000, // default
    "hosts": [
      // primary first
      "a.com", // main
      "b.com"
    ]
  }
}
// end of file`;
  it("converts YAML to JSONC keeping comments", () => {
    expect(yamlToJsonc(yaml)).toBe(jsonc);
  });
  it("converts JSONC to YAML keeping comments", () => {
    const output = jsoncToYaml(jsonc);
    for (const comment of [
      "# Service config",
      "  # Port to listen on",
      "  port: 3000 # default",
      "    # primary first",
      "    - a.com # main",
      "# end of file",
    ])
      expect(output).toContain(comment);
    expect(yamlToJsonc(output)).toBe(jsonc);
  });
  it("parses block comments, trailing commas and reports errors", () => {
    const document = parseJsonc('/* head */ {"a": [1, 2,], /* tail */}');
    expect(document.leading).toEqual([" head"]);
    expect(() => parseJsonc('{"a": }')).toThrow(/line 1, column 7/);
  });
});

describe("JSON paths", () => {
  const document =
    '{\n  "users": [\n    {"name": "Ada", "email": "a@x.io"},\n    {"name": "Lin", "email": "l@x.io"}\n  ],\n  "a b": {"c": 1}\n}';
  const at = (needle: string) =>
    formatPath(jsonPathAt(document, document.indexOf(needle) + 1)!);
  it("finds the path at a cursor offset", () => {
    expect(at('"l@x.io"')).toBe("$.users[1].email");
    expect(at('"Lin"')).toBe("$.users[1].name");
    expect(at('"c"')).toBe('$["a b"].c');
    expect(at('"users"')).toBe("$.users");
    expect(formatPath(jsonPathAt(document, 0)!)).toBe("$");
  });
  it("ignores invalid JSON after the cursor", () => {
    expect(formatPath(jsonPathAt('{"a": 1, "b": ???', 3)!)).toBe("$.a");
  });
  it("queries values with wildcards, recursion and negative indexes", () => {
    expect(queryJson(document, "$.users[*].email")).toEqual([
      "a@x.io",
      "l@x.io",
    ]);
    expect(queryJson(document, "$..name")).toEqual(["Ada", "Lin"]);
    expect(queryJson(document, '$["a b"].c')).toEqual([1]);
    expect(queryJson(document, "users[-1].name")).toEqual(["Lin"]);
    expect(queryJson(document, "$.missing")).toEqual([]);
    expect(() => queryJson(document, "$.users[")).toThrow(/Invalid JSON path/);
    expect(
      JSON.parse(
        executeAction("queryJson", document, { jsonPath: "$.users[0].name" })
          .text,
      ),
    ).toEqual(["Ada"]);
  });
});

describe("hover previews", () => {
  const now = Date.UTC(2026, 0, 1);
  it("describes JWTs with status", () => {
    const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(`{"exp":${now / 1000 + 3600}}`).toString("base64url")}.sig`;
    const hover = describeToken(token, now)!;
    expect(hover).toContain("**Transform · JWT** — Valid (expires in 1 hour)");
    expect(hover).toContain('"alg": "HS256"');
    expect(hover).toContain("_Signature not verified._");
  });
  it("describes Unix timestamps", () => {
    const hover = describeToken(String(now / 1000 - 7200), now)!;
    expect(hover).toContain("**Transform · Unix seconds** — 2 hours ago");
    expect(hover).toContain("UTC: `2025-12-31T22:00:00.000Z`");
    expect(describeToken(String(now), now)).toContain(
      "Unix milliseconds** — now",
    );
  });
  it("describes readable Base64 and ignores ordinary code", () => {
    expect(
      describeToken(Buffer.from("hello world").toString("base64"), now),
    ).toContain("hello world");
    for (const text of [
      "someVeryLongIdentifierName",
      "src/transforms/json.ts",
      "abcd1234efgh5678",
      "user.profile.settings",
      "12345",
    ])
      expect(describeToken(text, now)).toBeUndefined();
  });
  it("formats relative time", () => {
    expect(relativeTime(5000, 5000)).toBe("now");
  });
});

describe("detection of new formats", () => {
  it("detects JSON5, TOML and CSV", () => {
    expect(detectInput("{a: 1, // comment\n}")).toBe("json5");
    expect(detectInput('title = "x"\n[owner]\nname = "y"')).toBe("toml");
    expect(detectInput("name,age\nAda,36\nAlan,41")).toBe("csv");
    expect(detectInput("hello, world")).toBe("text");
    expect(relevantActions("json").map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "jsonToZod",
        "jsonToGo",
        "jsonToCsv",
        "queryJson",
      ]),
    );
    expect(relevantActions("yaml")[1].id).toBe("yamlToJsonc");
  });
});

describe("JSON error locations", () => {
  it("locates syntax errors that JSON.parse does not position", () => {
    expect(validateJson('{"a": 1,\n  "b": }')).toEqual({
      valid: false,
      message: 'Unexpected "}".',
      line: 2,
      column: 8,
    });
    expect(validateJson('{"a": 1,}')).toMatchObject({
      message: "Trailing commas are not allowed in JSON.",
      line: 1,
      column: 8,
    });
    expect(validateJson('{"a": 1 // c\n}')).toMatchObject({
      message: "Comments are not allowed in JSON.",
      column: 9,
    });
    expect(validateJson("[1, 2")).toMatchObject({ line: 1, column: 6 });
  });
});

describe("rating prompt", () => {
  const day = 86_400_000;
  const use = (count: number, start: number) => {
    let state: RatingState | undefined;
    for (let index = 0; index < count; index++) state = recordUse(state, start);
    return state!;
  };
  it("asks only after enough uses and days", () => {
    expect(shouldAskForRating(use(9, 0), 10 * day)).toBe(false);
    expect(shouldAskForRating(use(10, 0), 2 * day)).toBe(false);
    expect(shouldAskForRating(use(10, 0), 3 * day)).toBe(true);
  });
  it("snoozes on later or dismiss and stops after rating or never", () => {
    const state = use(10, 0);
    const later = applyRatingChoice(state, undefined, 3 * day);
    expect(shouldAskForRating(later, 10 * day)).toBe(false);
    expect(shouldAskForRating(later, 17 * day)).toBe(true);
    expect(
      shouldAskForRating(applyRatingChoice(state, "rate", 3 * day), 99 * day),
    ).toBe(false);
    expect(
      shouldAskForRating(applyRatingChoice(state, "never", 3 * day), 99 * day),
    ).toBe(false);
  });
  it("links to the right marketplace", () => {
    expect(reviewUrl("Visual Studio Code", "levkosyk.transform-tools")).toBe(
      "https://marketplace.visualstudio.com/items?itemName=levkosyk.transform-tools&ssr=false#review-details",
    );
    expect(reviewUrl("Cursor", "levkosyk.transform-tools")).toBe(
      "https://open-vsx.org/extension/levkosyk/transform-tools/reviews",
    );
  });
});
