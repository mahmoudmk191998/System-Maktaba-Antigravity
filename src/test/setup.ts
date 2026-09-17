import "@testing-library/jest-dom";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Provide clean Firestore mocks in test environment to avoid real network gRPC calls
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => null }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    addDoc: vi.fn().mockResolvedValue({ id: "mock-doc-id" }),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    onSnapshot: vi.fn().mockImplementation((_ref: any, onNext: any) => {
      if (typeof onNext === "function") {
        onNext({ exists: () => false, data: () => ({}), docs: [] });
      }
      return () => {};
    }),
  };
});

