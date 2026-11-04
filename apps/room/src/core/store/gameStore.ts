/**
 * 게임 전역 상태 스토어 (Zustand)
 *
 * Zustand는 Redux보다 보일러플레이트가 적은 React 상태 관리 라이브러리다.
 * create()에 상태와 액션을 함께 정의하고, 컴포넌트에서 useGameStore(selector)로 구독한다.
 *
 * Map을 사용하는 이유:
 * - players와 remoteStreams는 sessionId를 키로 O(1) 조회가 필요하다
 * - React는 참조가 같은 객체를 리렌더링하지 않으므로, 상태 업데이트 시
 *   항상 new Map(prev)로 새 Map을 만들어야 렌더링이 트리거된다 (불변성 규칙)
 */
import { create } from "zustand";

export interface PlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface GameState {
  mySessionId: string | null;
  players: Map<string, PlayerInfo>;       // sessionId → 플레이어 정보
  remoteStreams: Map<string, MediaStream>; // sessionId → 원격 미디어 스트림

  setMySessionId(id: string): void;
  upsertPlayer(sessionId: string, player: PlayerInfo): void;
  updatePlayerPosition(sessionId: string, x: number, y: number): void;
  removePlayer(sessionId: string): void;
  setRemoteStream(peerId: string, stream: MediaStream): void;
  removeRemoteStream(peerId: string): void;
}

export const useGameStore = create<GameState>((set) => ({
  mySessionId: null,
  players: new Map(),
  remoteStreams: new Map(),

  setMySessionId: (id) => set({ mySessionId: id }),

  /** 플레이어를 추가하거나 기존 정보를 덮어쓴다 (onAdd 콜백에서 사용) */
  upsertPlayer: (sessionId, player) =>
    set((state) => {
      const players = new Map(state.players);  // 새 Map 생성 (불변성)
      players.set(sessionId, player);
      return { players };
    }),

  /** x, y 좌표만 업데이트 (onChange 콜백에서 매 틱 호출될 수 있으므로 최소 복사) */
  updatePlayerPosition: (sessionId, x, y) =>
    set((state) => {
      const existing = state.players.get(sessionId);
      if (!existing) return {};  // 존재하지 않으면 상태 변경 없음
      const players = new Map(state.players);
      players.set(sessionId, { ...existing, x, y });
      return { players };
    }),

  /** 플레이어 퇴장 시 Map에서 제거 */
  removePlayer: (sessionId) =>
    set((state) => {
      const players = new Map(state.players);
      players.delete(sessionId);
      return { players };
    }),

  /** WebRTC ontrack 이벤트로 원격 스트림을 받았을 때 저장 */
  setRemoteStream: (peerId, stream) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.set(peerId, stream);
      return { remoteStreams };
    }),

  /** 피어 연결 해제 시 스트림 제거 */
  removeRemoteStream: (peerId) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.delete(peerId);
      return { remoteStreams };
    }),
}));
