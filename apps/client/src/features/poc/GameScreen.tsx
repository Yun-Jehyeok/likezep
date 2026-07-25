import { useEffect, useRef, useCallback } from "react";
import type { Room } from "colyseus.js";
import { useGameStore } from "../../core/store/gameStore.js";
import { joinPocRoom } from "../../core/realtime/colyseusClient.js";
import {
  initPeerAsOfferer,
  initPeerAsAnswerer,
  handleAnswer,
  handleIceCandidate,
} from "../../core/webrtc/peerManager.js";
import { getIceServers } from "../../core/webrtc/iceServers.js";
import { cleanupAllPeers, cleanupPeer } from "../../core/webrtc/cleanup.js";
import { GameCanvas } from "./GameCanvas.js";
import { VideoGrid } from "./VideoGrid.js";

interface Props {
  playerName: string;
}

export function GameScreen({ playerName }: Props) {
  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;

    async function setup() {
      const [stream, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
        getIceServers(),
      ]);
      if (!active) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;

      const { setMySessionId, upsertPlayer, updatePlayerPosition, removePlayer, removeRemoteStream } =
        useGameStore.getState();

      const room = await joinPocRoom(playerName, {
        onPlayerJoin(sessionId, player) {
          upsertPlayer(sessionId, player);
        },
        onPlayerLeave(sessionId) {
          removePlayer(sessionId);
        },
        onPlayerMove(sessionId, x, y) {
          updatePlayerPosition(sessionId, x, y);
        },
        onProximityConnect(peerId, isOfferer) {
          if (!localStreamRef.current) return;
          if (isOfferer) {
            initPeerAsOfferer(peerId, localStreamRef.current, iceServers, sendSignal, onRemoteStream);
          }
          // answerer waits for webrtc-offer to arrive
        },
        onProximityDisconnect(peerId) {
          cleanupPeer(peerId);
          removeRemoteStream(peerId);
        },
        onWebRtcOffer(from, sdp) {
          if (!localStreamRef.current) return;
          initPeerAsAnswerer(from, localStreamRef.current, iceServers, sdp, sendSignal, onRemoteStream);
        },
        onWebRtcAnswer(from, sdp) {
          handleAnswer(from, sdp);
        },
        onWebRtcIce(from, candidate) {
          handleIceCandidate(from, candidate);
        },
      });

      if (!active) {
        room.leave();
        return;
      }

      roomRef.current = room;
      setMySessionId(room.sessionId);
    }

    function sendSignal(type: string, payload: object) {
      roomRef.current?.send(type, payload);
    }

    function onRemoteStream(peerId: string, stream: MediaStream) {
      useGameStore.getState().setRemoteStream(peerId, stream);
    }

    setup().catch(console.error);

    return () => {
      active = false;
      cleanupAllPeers();
      roomRef.current?.leave();
      roomRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, [playerName]);

  const handleMove = useCallback((x: number, y: number) => {
    roomRef.current?.send("move", { x, y });
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#1a1a2e",
      }}
    >
      <GameCanvas onMove={handleMove} />
      <VideoGrid />
    </div>
  );
}
