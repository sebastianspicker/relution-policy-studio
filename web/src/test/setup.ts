import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const testLocalStorage = createTestStorage();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: testLocalStorage,
});

afterEach(() => {
  testLocalStorage.clear();
  cleanup();
});

function createTestStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length(): number {
      return values.size;
    },
    clear(): void {
      values.clear();
    },
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}
