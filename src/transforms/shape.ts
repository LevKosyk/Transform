export type ShapeOf = (value: unknown) => string;

export function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createShapeOf(primitiveShape: ShapeOf): ShapeOf {
  const cache = new WeakMap<object, string>();
  const shapeOf: ShapeOf = (value) => {
    if (value === null || typeof value !== "object")
      return primitiveShape(value);
    const cached = cache.get(value);
    if (cached) return cached;
    const shape = Array.isArray(value)
      ? JSON.stringify(["array", [...new Set(value.map(shapeOf))].sort()])
      : JSON.stringify([
          "object",
          Object.keys(value)
            .sort(compareKeys)
            .map((key) => [
              key,
              shapeOf((value as Record<string, unknown>)[key]),
            ]),
        ]);
    cache.set(value, shape);
    return shape;
  };
  return shapeOf;
}
