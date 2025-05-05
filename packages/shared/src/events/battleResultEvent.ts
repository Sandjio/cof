export type BattleResultEvent = {
  eventType: "BattleResult";
  playerId: string;
  timestamp: string;
  payload: {
    battleId: string;
    winnerId: string;
    trophiesGained: number;
    goldLooted: number;
  };
};
