declare module "bun:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;

  export type ExpectMatcher = (...expected: unknown[]) => ExpectResult;

  export type ExpectResult = Record<string, ExpectMatcher> & {
    not: ExpectResult;
    resolves: ExpectResult;
    rejects: ExpectResult;
  };

  export type ExpectStatic = {
    (actual: unknown): ExpectResult;
    extend(matchers: Record<string, unknown>): void;
    objectContaining(value: Record<string, unknown>): unknown;
  };

  export const expect: ExpectStatic;
}
