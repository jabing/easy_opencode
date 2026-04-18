declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => Promise<void> | void): void;
declare function expect(value: unknown): {
  toBe(expected: unknown): void;
  toMatchObject(expected: Record<string, unknown>): void;
};
