export {};

type LoreWeaverRoleContextEntry = {
  file: string;
  reason: string;
};

declare global {
  interface ObjectConstructor {
    /** Keep TaskContract role-context entries strongly typed under TS 5.8. */
    entries(
      value: Record<string, LoreWeaverRoleContextEntry[]>
    ): Array<[string, LoreWeaverRoleContextEntry[]]>;
  }
}
