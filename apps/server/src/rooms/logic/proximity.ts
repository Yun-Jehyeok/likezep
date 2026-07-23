export interface Point { x: number; y: number }
export interface PeerPair { a: string; b: string } // a < b guaranteed

function encodePair(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

function makePair(id1: string, id2: string): PeerPair {
  return id1 < id2 ? { a: id1, b: id2 } : { a: id2, b: id1 };
}

export function computeProximityChanges(params: {
  players: Map<string, Point>;
  connectedPairs: Set<string>;
  connectThreshold: number;
  disconnectThreshold: number;
}): { toConnect: PeerPair[]; toDisconnect: PeerPair[] } {
  const { players, connectedPairs, connectThreshold, disconnectThreshold } = params;
  const ids = [...players.keys()];
  const toConnect: PeerPair[] = [];
  const toDisconnect: PeerPair[] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const id1 = ids[i]!;
      const id2 = ids[j]!;
      const p1 = players.get(id1)!;
      const p2 = players.get(id2)!;
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const key = encodePair(id1, id2);
      const connected = connectedPairs.has(key);

      if (!connected && dist < connectThreshold) {
        toConnect.push(makePair(id1, id2));
      } else if (connected && dist >= disconnectThreshold) {
        toDisconnect.push(makePair(id1, id2));
      }
    }
  }

  return { toConnect, toDisconnect };
}
