import { describe, expect, it } from "vitest";
import {
  formatJson,
  minifyJson,
  sortJsonKeys,
  validateJson,
  jsonToYaml,
  yamlToJson,
} from "../src/transforms/json";
import { jsonToTypescript } from "../src/transforms/typescript";
import { jsonToSchema } from "../src/transforms/jsonSchema";
import { decodeJwt } from "../src/transforms/jwt";
import {
  base64Encode,
  base64Decode,
  parseUrl,
  parseQuery,
} from "../src/transforms/encoding";
import { detectDateKind, dateFormats } from "../src/transforms/dates";
import { generateUuid, validateUuid } from "../src/transforms/uuid";
import { convertCase } from "../src/transforms/cases";
import { detectInput } from "../src/detection/detectInput";
import { relevantActions } from "../src/services/actions";

describe("JSON and YAML", () => {
  it("formats, minifies and validates JSON", () => {
    expect(formatJson('{"a":1}', "4")).toBe('{\n    "a": 1\n}');
    expect(minifyJson('{\n "a": 1\n}')).toBe('{"a":1}');
    expect(validateJson("{bad}").valid).toBe(false);
    expect(validateJson('{"a":1}').valid).toBe(true);
  });
  it("sorts object keys recursively while preserving array order", () => {
    expect(
      sortJsonKeys(
        '{"z":1,"a":{"z":2,"b":3},"items":[{"z":1,"a":2},{"y":1,"x":2}]}',
      ),
    ).toBe(
      '{\n  "a": {\n    "b": 3,\n    "z": 2\n  },\n  "items": [\n    {\n      "a": 2,\n      "z": 1\n    },\n    {\n      "x": 2,\n      "y": 1\n    }\n  ],\n  "z": 1\n}',
    );
  });
  it("generates a JSON Schema with nested and mixed array types", () => {
    const schema = JSON.parse(
      jsonToSchema('{"user":{"id":1},"values":[1,"two"],"empty":[]}'),
    );
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.required).toEqual(["user", "values", "empty"]);
    expect(schema.properties.user.required).toEqual(["id"]);
    expect(schema.properties.user.properties.id.type).toBe("integer");
    expect(schema.properties.values.items.anyOf).toEqual([
      { type: "integer" },
      { type: "string" },
    ]);
    expect(schema.properties.empty.items).toEqual({});
  });
  it("converts between JSON and YAML", () => {
    const yaml = jsonToYaml('{"server":{"port":3000}}');
    expect(yaml).toContain("port: 3000");
    expect(yamlToJson(yaml)).toContain('"port": 3000');
    expect(() => yamlToJson("a: 1\na: 2")).toThrow();
  });
});
describe("TypeScript generation", () => {
  it("generates root and nested interfaces", () => {
    const output = jsonToTypescript(
      '{"user":{"id":1,"profile":{"name":"Lev"}}}',
    );
    expect(output).toContain("interface Root {");
    expect(output).toContain("user: User;");
    expect(output).toContain("interface User {");
    expect(output).toContain("profile: Profile;");
    expect(output).toContain("interface Profile {");
  });
  it("reuses one interface for repeated array object shapes", () => {
    const input = JSON.stringify({
      items: Array.from({ length: 1000 }, (_, id) => ({
        id,
        name: `item ${id}`,
      })),
    });
    const output = jsonToTypescript(input);
    expect(output).toContain("items: Items[];");
    expect(output.match(/interface Items/g)).toHaveLength(1);
    expect(output).not.toContain("Items2");
  });
  it("handles arrays, nulls and aliases", () => {
    const output = jsonToTypescript(
      '{"roles":["admin"],"items":[{"id":1}],"mixed":[1,"x"],"other":null}',
      "type",
    );
    expect(output).toContain("roles: string[];");
    expect(output).toContain("items: Items[];");
    expect(output).toContain("mixed: (number | string)[];");
    expect(output).toContain("other: null;");
    expect(output).toContain("type Root = {");
  });
  it("supports root names, exports and optional properties", () => {
    const output = jsonToTypescript(
      '{"id":1,"display-name":"Ada"}',
      "type",
      "2",
      {
        rootName: "Api Response",
        export: true,
        optionalProperties: true,
      },
    );
    expect(output).toContain("export type ApiResponse = {");
    expect(output).toContain("id?: number;");
    expect(output).toContain('"display-name"?: string;');
  });
});
describe("encoding and dates", () => {
  it("decodes JWT locally without signature verification", () => {
    const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"sub":"42","exp":1780003600}').toString("base64url")}.signature`;
    expect(decodeJwt(token).payload.sub).toBe("42");
    expect(decodeJwt(token).timestamps.exp).toContain("2026");
  });
  it("round trips UTF-8 Base64 and rejects invalid input", () => {
    expect(base64Decode(base64Encode("Привіт 👋"))).toBe("Привіт 👋");
    expect(() => base64Decode("%%%%")).toThrow();
  });
  it("parses URLs and repeated query parameters", () => {
    expect(parseUrl("https://api.example.com/users?page=2")).toMatchObject({
      protocol: "https:",
      host: "api.example.com",
      pathname: "/users",
      query: { page: "2" },
    });
    expect(parseQuery("?tag=a&tag=b")).toEqual({ tag: ["a", "b"] });
  });
  it("detects seconds, milliseconds and ISO dates", () => {
    expect(detectDateKind("1790760600")).toBe("seconds");
    expect(detectDateKind("1790760600000")).toBe("milliseconds");
    expect(detectDateKind("2026-09-30T09:30:00.000Z")).toBe("iso");
    expect(dateFormats("1790760600").utc).toBe("2026-09-30T09:30:00.000Z");
  });
});
describe("UUID, strings and detection", () => {
  it("validates generated UUIDs", () => {
    expect(validateUuid(generateUuid())).toBe(true);
    expect(validateUuid("not-a-uuid")).toBe(false);
  });
  it("converts case styles", () => {
    expect(convertCase("user profile settings", "camel")).toBe(
      "userProfileSettings",
    );
    expect(convertCase("user profile settings", "pascal")).toBe(
      "UserProfileSettings",
    );
    expect(convertCase("userProfileSettings", "snake")).toBe(
      "user_profile_settings",
    );
    expect(convertCase("user profile settings", "kebab")).toBe(
      "user-profile-settings",
    );
    expect(convertCase("user profile settings", "constant")).toBe(
      "USER_PROFILE_SETTINGS",
    );
  });
  it("detects inputs without mistaking common words for Base64", () => {
    expect(detectInput('{"a":1}')).toBe("json");
    expect(detectInput("https://example.com")).toBe("url");
    expect(detectInput("server:\n  port: 3000")).toBe("yaml");
    expect(detectInput("1790760600")).toBe("timestamp");
    expect(detectInput("hello world")).toBe("text");
    expect(detectInput("developer")).toBe("text");
    expect(detectInput("")).toBe("unknown");
    expect(relevantActions("json")[0].id).toBe("formatJson");
  });
});
