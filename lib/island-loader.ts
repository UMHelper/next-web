type IslandModule = typeof import("animal-island-ui");

let cached: Promise<IslandModule> | null = null;

export function loadIsland(): Promise<IslandModule> {
  if (!cached) {
    cached = Promise.all([
      import("animal-island-ui/style"),
      import("animal-island-ui"),
    ])
      .then(([, mod]) => mod)
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
