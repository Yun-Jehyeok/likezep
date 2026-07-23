import { create } from "zustand";

export interface PlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface GameState {
  mySessionId: string | null;
  players: Map<string, PlayerInfo>;
  remoteStreams: Map<string, MediaStream>;
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

  upsertPlayer: (sessionId, player) =>
    set((state) => {
      const players = new Map(state.players);
      players.set(sessionId, player);
      return { players };
    }),

  updatePlayerPosition: (sessionId, x, y) =>
    set((state) => {
      const existing = state.players.get(sessionId);
      if (!existing) return {};
      const players = new Map(state.players);
      players.set(sessionId, { ...existing, x, y });
      return { players };
    }),

  removePlayer: (sessionId) =>
    set((state) => {
      const players = new Map(state.players);
      players.delete(sessionId);
      return { players };
    }),

  setRemoteStream: (peerId, stream) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.set(peerId, stream);
      return { remoteStreams };
    }),

  removeRemoteStream: (peerId) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.delete(peerId);
      return { remoteStreams };
    }),
}));
