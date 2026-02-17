export interface NetworkPlayerSideSource {
  getKnownPlayerSlots(): number[];
  getPlayerSide(playerNum: number): string | null;
}

export interface GameLogicPlayerSideSink {
  setPlayerSide(playerIndex: number, side: string | null | undefined): void;
}

/**
 * Mirror session slot side ownership into game-logic relationship routing.
 */
export function syncPlayerSidesFromNetwork(
  source: NetworkPlayerSideSource,
  sink: GameLogicPlayerSideSink,
): void {
  for (const playerSlot of source.getKnownPlayerSlots()) {
    sink.setPlayerSide(playerSlot, source.getPlayerSide(playerSlot));
  }
}
