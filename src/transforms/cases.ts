export type CaseStyle =
  "camel" | "pascal" | "snake" | "kebab" | "constant" | "lower" | "upper";
export function convertCase(input: string, style: CaseStyle): string {
  if (style === "lower") return input.toLowerCase();
  if (style === "upper") return input.toUpperCase();
  const words =
    input
      .normalize("NFKC")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .match(/[\p{L}\p{N}]+/gu)
      ?.map((word) => word.toLowerCase()) ?? [];
  const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  if (style === "camel")
    return words.map((word, index) => (index ? cap(word) : word)).join("");
  if (style === "pascal") return words.map(cap).join("");
  if (style === "snake") return words.join("_");
  if (style === "kebab") return words.join("-");
  return words.join("_").toUpperCase();
}
