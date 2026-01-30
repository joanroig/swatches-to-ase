export const createId = () =>
  (crypto.randomUUID?.() ?? `palette-${Date.now()}-${Math.random()}`).toString();
