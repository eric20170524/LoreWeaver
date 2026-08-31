export {};

declare global {
  interface ObjectConstructor {
    /** Preserve the array element type for dictionary-style UI rendering. */
    entries<T>(value: Record<string, T[]>): Array<[string, T[]]>;
  }
}
