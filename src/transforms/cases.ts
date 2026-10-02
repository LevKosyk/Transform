export type CaseStyle =
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "title"
  | "sentence"
  | "dot"
  | "path"
  | "slug"
  | "lower"
  | "upper";

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function wordsOf(input: string): string[] {
  return (
    input
      .normalize("NFKC")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .match(/[\p{L}\p{N}]+/gu)
      ?.map((word) => word.toLowerCase()) ?? []
  );
}

function slugify(input: string): string {
  return wordsOf(input.normalize("NFKD").replace(/\p{M}/gu, ""))
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .join("-");
}

export function convertCase(input: string, style: CaseStyle): string {
  if (style === "lower") return input.toLowerCase();
  if (style === "upper") return input.toUpperCase();
  if (style === "slug") return slugify(input);
  const words = wordsOf(input);
  switch (style) {
    case "camel":
      return words
        .map((word, index) => (index ? capitalize(word) : word))
        .join("");
    case "pascal":
      return words.map(capitalize).join("");
    case "snake":
      return words.join("_");
    case "kebab":
      return words.join("-");
    case "constant":
      return words.join("_").toUpperCase();
    case "title":
      return words.map(capitalize).join(" ");
    case "sentence":
      return capitalize(words.join(" "));
    case "dot":
      return words.join(".");
    case "path":
      return words.join("/");
  }
}
