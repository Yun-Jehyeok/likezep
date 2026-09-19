/**
 * 근접 감지(Proximity Detection) 순수 함수 모듈
 *
 * 이 파일은 Colyseus를 import하지 않는다 (CLAUDE.md 절대 규칙).
 * 순수 함수로 작성되어 있어 ProximityRoom.tick()에서 호출하기도 쉽고,
 * 독립적으로 단위 테스트(proximity.test.ts)하기도 쉽다.
 *
 * 핵심 아이디어: 히스테리시스(Hysteresis) 밴드
 * ─────────────────────────────────────────────
 * 연결:    거리 < connectThreshold  (기본 150px)
 * 해제:    거리 ≥ disconnectThreshold (기본 180px)
 *
 * connectThreshold < disconnectThreshold 로 설정하는 이유:
 * 만약 동일 값이면 경계선에서 connect/disconnect가 매 틱 반복 발생(채터링)한다.
 * 30px의 "무감지 구간"을 두면 경계 근처에서 안정적으로 유지된다.
 */

export interface Point { x: number; y: number }

/**
 * 두 피어의 쌍을 표현. a < b 를 항상 보장해 (a,b)와 (b,a)를 같은 쌍으로 취급한다.
 * Set에 저장할 때 "a:b" 형식의 키로 사용한다.
 */
export interface PeerPair { a: string; b: string }

/** 두 ID를 사전순으로 정렬해 "항상 같은 키"를 만든다 */
function encodePair(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/** 정렬된 PeerPair 객체 생성 */
function makePair(id1: string, id2: string): PeerPair {
  return id1 < id2 ? { a: id1, b: id2 } : { a: id2, b: id1 };
}

/**
 * 현재 플레이어 위치와 기존 연결 상태를 보고,
 * 이번 틱에 새로 연결해야 할 쌍(toConnect)과 해제해야 할 쌍(toDisconnect)을 반환한다.
 *
 * 시간복잡도: O(n²) — 모든 플레이어 쌍을 검사한다.
 * n=20(maxClients)이면 190쌍 → 매 100ms 틱에도 충분히 빠르다.
 */
export function computeProximityChanges(params: {
  players: Map<string, Point>;
  connectedPairs: Set<string>;     // "a:b" 형식의 현재 연결된 쌍 집합
  connectThreshold: number;
  disconnectThreshold: number;
}): { toConnect: PeerPair[]; toDisconnect: PeerPair[] } {
  const { players, connectedPairs, connectThreshold, disconnectThreshold } = params;
  const ids = [...players.keys()];
  const toConnect: PeerPair[] = [];
  const toDisconnect: PeerPair[] = [];

  // 이중 루프로 모든 (i, j) 쌍을 한 번씩만 검사 (j는 i+1부터 시작해 중복 방지)
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const id1 = ids[i]!;
      const id2 = ids[j]!;
      const p1 = players.get(id1)!;
      const p2 = players.get(id2)!;

      // 유클리드 거리 계산 (픽셀 단위)
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const key = encodePair(id1, id2);
      const connected = connectedPairs.has(key);

      if (!connected && dist < connectThreshold) {
        // 아직 연결 안 됐는데 가까워졌다 → 연결 추가
        toConnect.push(makePair(id1, id2));
      } else if (connected && dist >= disconnectThreshold) {
        // 연결돼 있는데 충분히 멀어졌다 → 연결 해제
        toDisconnect.push(makePair(id1, id2));
      }
      // connectThreshold ≤ dist < disconnectThreshold 구간은 상태 유지 (히스테리시스)
    }
  }

  return { toConnect, toDisconnect };
}
