/**
 * Resolve tournament game sides from the current schema (`side1` / `side2`)
 * or legacy documents that still store `teams[0]` / `teams[1]`.
 */
export function getGameSides<T extends { players?: unknown[] }>(game: {
  side1?: T | null;
  side2?: T | null;
  teams?: T[] | null;
}): [T, T] | null {
  if (game.side1 != null && game.side2 != null) {
    return [game.side1, game.side2];
  }
  if (Array.isArray(game.teams) && game.teams.length >= 2) {
    return [game.teams[0], game.teams[1]];
  }
  return null;
}
