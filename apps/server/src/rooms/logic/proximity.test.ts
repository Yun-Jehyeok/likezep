import { describe, it, expect } from "vitest";
import { computeProximityChanges } from "./proximity.js";

describe("computeProximityChanges", () => {
  it("두 플레이어가 가까우면 toConnect 반환", () => {
    const players = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 100, y: 0 }],
    ]);
    const { toConnect, toDisconnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toConnect).toHaveLength(1);
    expect(toConnect[0]).toEqual({ a: "a", b: "b" });
    expect(toDisconnect).toHaveLength(0);
  });

  it("두 플레이어가 멀면 toConnect 없음", () => {
    const players = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 200, y: 0 }],
    ]);
    const { toConnect, toDisconnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toConnect).toHaveLength(0);
    expect(toDisconnect).toHaveLength(0);
  });

  it("연결된 쌍이 disconnectThreshold 이상 멀어지면 toDisconnect 반환", () => {
    const players = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 200, y: 0 }],
    ]);
    const { toConnect, toDisconnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(["a:b"]),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toDisconnect).toHaveLength(1);
    expect(toDisconnect[0]).toEqual({ a: "a", b: "b" });
    expect(toConnect).toHaveLength(0);
  });

  it("히스테리시스: 연결됨 + connectThreshold < 거리 < disconnectThreshold → 변화 없음", () => {
    const players = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 160, y: 0 }], // 160px: 연결 임계(150) 초과, 해제 임계(180) 미만
    ]);
    const { toConnect, toDisconnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(["a:b"]),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toConnect).toHaveLength(0);
    expect(toDisconnect).toHaveLength(0);
  });

  it("3명 모두 근접 시 3쌍 모두 toConnect", () => {
    const players = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 50, y: 0 }],
      ["c", { x: 25, y: 40 }],
    ]);
    const { toConnect, toDisconnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toConnect).toHaveLength(3);
    expect(toDisconnect).toHaveLength(0);
  });

  it("플레이어 1명이면 결과 없음", () => {
    const players = new Map([["a", { x: 0, y: 0 }]]);
    const { toConnect, toDisconnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toConnect).toHaveLength(0);
    expect(toDisconnect).toHaveLength(0);
  });

  it("PeerPair는 항상 a < b (lexicographic) 순서", () => {
    const players = new Map([
      ["z", { x: 0, y: 0 }],
      ["a", { x: 50, y: 0 }],
    ]);
    const { toConnect } = computeProximityChanges({
      players,
      connectedPairs: new Set(),
      connectThreshold: 150,
      disconnectThreshold: 180,
    });
    expect(toConnect[0]!.a).toBe("a");
    expect(toConnect[0]!.b).toBe("z");
  });
});
