import { useState } from "react";
import { JoinScreen } from "./features/poc/JoinScreen.js";
import { GameScreen } from "./features/poc/GameScreen.js";

export function App() {
  const [playerName, setPlayerName] = useState<string | null>(null);

  return playerName ? (
    <GameScreen playerName={playerName} />
  ) : (
    <JoinScreen onJoin={setPlayerName} />
  );
}
