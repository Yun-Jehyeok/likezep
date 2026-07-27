import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { Room } from "colyseus.js";
import { useAuthStore } from "../../app/store.js";
import { joinRoom, type PlayerInfo } from "../../core/realtime/colyseusClient.js";
import { GameApp } from "../../game/GameApp.js";
import { api } from "../../core/api/client.js";
import { getIceServers } from "../../core/webrtc/iceServers.js";
import {
  initPeerAsOfferer,
  initPeerAsAnswerer,
  handleAnswer,
  handleIceCandidate,
} from "../../core/webrtc/peerManager.js";
import { cleanupPeer, cleanupAllPeers } from "../../core/webrtc/cleanup.js";
import { useScreenShare } from "../screenshare/useScreenShare.js";
import { ScreenShareOverlay } from "./ScreenShareOverlay.js";
import { RoomSwitcher } from "./RoomSwitcher.js";

interface ChatMessage {
  id?: string;
  userId: string;
  name: string;
  text?: string;
  content?: string;
  timestamp?: string;
  createdAt?: string;
}

interface RemotePeer {
  stream: MediaStream;
  name: string;
}

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const { user, token } = useAuthStore();
  const navigate = useNavigate();

  const [chatOpen, setChatOpen] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [occupants, setOccupants] = useState(0);
  const [connError, setConnError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remotePeers, setRemotePeers] = useState<Record<string, RemotePeer>>({});
  const [colyseusRoom, setColyseusRoom] = useState<Room | null>(null);

  const { isSharing, startShare, stopShare, screenStream } = useScreenShare(colyseusRoom);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const gameRef = useRef<GameApp | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomSendRef = useRef<(type: string, payload: unknown) => void>(() => {});
  const playerNamesRef = useRef<Map<string, string>>(new Map());
  const pendingPlayers = useRef<[string, PlayerInfo][]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const roomName = (location.state as { roomName?: string } | null)?.roomName ?? roomId;
  const isPresenter = user?.role === "admin" || user?.role === "mentor";

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!roomId || !token || !user || !canvasRef.current) return;

    setOccupants(0);
    setMessages([]);
    setRemotePeers({});

    let cancelled = false;
    const canvas = canvasRef.current;

    const sendSignal = (type: string, payload: object) => roomSendRef.current(type, payload);

    async function ensureLocalStream(): Promise<MediaStream> {
      if (localStreamRef.current) return localStreamRef.current;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = s;
        return s;
      } catch {
        const s = new MediaStream();
        localStreamRef.current = s;
        return s;
      }
    }

    function onRemoteStream(peerId: string, stream: MediaStream) {
      const name = playerNamesRef.current.get(peerId) ?? peerId.slice(0, 6);
      setRemotePeers((prev) => ({ ...prev, [peerId]: { stream, name } }));
    }

    joinRoom(roomId, token, user.name, {
      onPlayerJoin: (sessionId, info) => {
        setOccupants((n) => n + 1);
        playerNamesRef.current.set(sessionId, info.name);
        if (gameRef.current) {
          gameRef.current.addPlayer(sessionId, info);
        } else {
          pendingPlayers.current.push([sessionId, info]);
        }
      },
      onPlayerLeave: (sessionId) => {
        if (!playerNamesRef.current.has(sessionId)) return;
        playerNamesRef.current.delete(sessionId);
        setOccupants((n) => Math.max(0, n - 1));
        gameRef.current?.removePlayer(sessionId);
        cleanupPeer(sessionId);
        setRemotePeers((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      },
      onPlayerMove: (sessionId, x, y) => {
        gameRef.current?.movePlayer(sessionId, x, y);
      },
      onProximityConnect: async (peerId, isOfferer) => {
        const iceServers = await getIceServers();
        const stream = await ensureLocalStream();
        if (isOfferer) {
          await initPeerAsOfferer(peerId, stream, iceServers, sendSignal, onRemoteStream);
        } else {
          // answerer waits for offer via onWebRtcOffer
          void peerId;
        }
      },
      onProximityDisconnect: (peerId) => {
        cleanupPeer(peerId);
        setRemotePeers((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      },
      onWebRtcOffer: async (from, sdp) => {
        const iceServers = await getIceServers();
        const stream = await ensureLocalStream();
        await initPeerAsAnswerer(from, stream, iceServers, sdp, sendSignal, onRemoteStream);
      },
      onWebRtcAnswer: async (from, sdp) => {
        await handleAnswer(from, sdp);
      },
      onWebRtcIce: async (from, candidate) => {
        await handleIceCandidate(from, candidate);
      },
    })
      .then(async (room) => {
        if (cancelled) { room.leave(); return; }
        roomRef.current = room;
        roomSendRef.current = (type, payload) => room.send(type, payload);
        setColyseusRoom(room);

        // Listen to chat messages
        room.onMessage<ChatMessage>("chat", (msg) => {
          if (!cancelled) setMessages((prev) => [...prev, msg]);
        });

        // Load chat history
        api.get<ChatMessage[]>(`/api/rooms/${roomId}/chat`)
          .then((history) => { if (!cancelled) setMessages(history); })
          .catch(console.error);

        // Init PixiJS
        const game = await GameApp.create(canvas, room.sessionId, user.name, room);
        if (cancelled) { game.destroy(); return; }
        gameRef.current = game;

        for (const [sid, info] of pendingPlayers.current) game.addPlayer(sid, info);
        pendingPlayers.current = [];
      })
      .catch((err: Error) => {
        if (!cancelled) setConnError(err?.message ?? "룸 연결에 실패했습니다.");
      });

    return () => {
      cancelled = true;
      setColyseusRoom(null);
      cleanupAllPeers();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      gameRef.current?.destroy();
      gameRef.current = null;
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, [roomId, token, user]);

  function handleLeave() {
    setColyseusRoom(null);
    cleanupAllPeers();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    gameRef.current?.destroy();
    gameRef.current = null;
    roomRef.current?.leave();
    roomRef.current = null;
    navigate("/lobby");
  }

  function handleChatFocus() { gameRef.current?.setChatFocused(true); }
  function handleChatBlur()  { gameRef.current?.setChatFocused(false); }

  function submitChat() {
    const text = chatInput.trim();
    if (!text) return;
    roomSendRef.current("chat", { text });
    setChatInput("");
  }

  async function toggleMic() {
    if (!micOn) {
      try {
        if (!localStreamRef.current) {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = s;
        }
        localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = true; });
        setMicOn(true);
      } catch { /* permission denied */ }
    } else {
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
      setMicOn(false);
    }
  }

  async function toggleCam() {
    if (!camOn) {
      try {
        if (!localStreamRef.current) {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          localStreamRef.current = s;
          setMicOn(true);
        } else {
          const videoTracks = localStreamRef.current.getVideoTracks();
          if (videoTracks.length === 0) {
            const vs = await navigator.mediaDevices.getUserMedia({ video: true });
            vs.getVideoTracks().forEach((t) => localStreamRef.current!.addTrack(t));
          } else {
            videoTracks.forEach((t) => { t.enabled = true; });
          }
        }
        setCamOn(true);
      } catch { /* permission denied */ }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = false; });
      setCamOn(false);
    }
  }

  const remotePeerList = Object.entries(remotePeers);

  return (
    <div className="h-screen flex flex-col font-[Pretendard,sans-serif]">

      {/* 상단 헤더 */}
      <header className="h-14 bg-white border-b border-[#e4e4e4] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLeave}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f4f6f9] text-[#767676] hover:text-[#17171b] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="w-px h-4 bg-[#e4e4e4]" />
          <span className="text-[15px] font-semibold text-[#17171b]">{roomName}</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${connError ? "bg-[#e03131]" : "bg-[#22c55e]"}`} />
            <span className="text-sm text-[#767676]">
              {connError ? "연결 실패" : `${occupants}명 접속 중`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPresenter && roomId && <RoomSwitcher currentRoomId={roomId} />}
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${chatOpen ? "bg-[#e8f1ff] text-[#0071ff]" : "hover:bg-[#f4f6f9] text-[#767676]"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      {/* 메인 */}
      <div className="flex flex-1 overflow-hidden">

        {/* 게임 캔버스 */}
        <div className="flex-1 relative">
          <canvas key={roomId} ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {connError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#12121a]">
              <div className="text-center">
                <p className="text-red-400 text-sm font-medium mb-1">연결 오류</p>
                <p className="text-white/40 text-xs">{connError}</p>
              </div>
            </div>
          )}

          {/* 근접 화상 타일 */}
          {remotePeerList.length > 0 && (
            <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none">
              {remotePeerList.map(([peerId, peer]) => (
                <VideoTile key={peerId} stream={peer.stream} name={peer.name} />
              ))}
            </div>
          )}

          {/* 화면공유 오버레이 */}
          {screenStream && <ScreenShareOverlay stream={screenStream} />}

          {/* 화면공유 버튼 */}
          {isPresenter && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
              {isSharing ? (
                <button
                  type="button"
                  onClick={stopShare}
                  className="h-9 px-4 bg-[#e03131] hover:bg-[#c92a2a] text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="3" width="20" height="14" rx="2" stroke="white" strokeWidth="1.8"/>
                    <path d="M8 21h8M12 17v4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  공유 중단
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startShare}
                  className="h-9 px-4 bg-[#0071ff] hover:bg-[#0064e6] text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="3" width="20" height="14" rx="2" stroke="white" strokeWidth="1.8"/>
                    <path d="M8 21h8M12 17v4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  화면 공유
                </button>
              )}
            </div>
          )}
        </div>

        {/* 채팅 패널 */}
        {chatOpen && (
          <div className="w-72 bg-white border-l border-[#e4e4e4] flex flex-col shrink-0">
            <div className="h-11 flex items-center px-4 border-b border-[#e4e4e4]">
              <span className="text-sm font-semibold text-[#17171b]">채팅</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {messages.length === 0 ? (
                <p className="text-[#b2b2b2] text-xs text-center py-6">채팅 기록이 없습니다</p>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.userId === user?.id;
                  const text = msg.text ?? msg.content ?? "";
                  return (
                    <div key={msg.id ?? i} className={`flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                      {!isMe && (
                        <span className="text-[11px] text-[#767676] px-1">{msg.name}</span>
                      )}
                      <div className={`max-w-[200px] px-3 py-2 rounded-2xl text-sm break-words ${
                        isMe
                          ? "bg-[#0071ff] text-white rounded-tr-sm"
                          : "bg-[#f4f6f9] text-[#17171b] rounded-tl-sm"
                      }`}>
                        {text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-[#e4e4e4]">
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-[#e4e4e4] focus-within:border-[#0071ff] transition-colors bg-white">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onFocus={handleChatFocus}
                  onBlur={handleChatBlur}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitChat(); } }}
                  placeholder="메시지 입력..."
                  className="flex-1 text-sm text-[#17171b] placeholder:text-[#b2b2b2] outline-none bg-transparent"
                />
                <button
                  type="button"
                  onClick={submitChat}
                  disabled={!chatInput.trim()}
                  className="text-[#0071ff] disabled:text-[#b2b2b2] transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 컨트롤 바 */}
      <div className="h-16 bg-white border-t border-[#e4e4e4] flex items-center justify-center gap-2 shrink-0 px-4">
        <ControlButton
          active={micOn}
          onClick={toggleMic}
          label={micOn ? "마이크 끄기" : "마이크 켜기"}
          activeColor="bg-[#f4f6f9] text-[#17171b]"
          inactiveColor="bg-[#fff1f0] text-[#e03131]"
          icon={micOn ? <MicOnIcon /> : <MicOffIcon />}
        />
        <ControlButton
          active={camOn}
          onClick={toggleCam}
          label={camOn ? "카메라 끄기" : "카메라 켜기"}
          activeColor="bg-[#f4f6f9] text-[#17171b]"
          inactiveColor="bg-[#fff1f0] text-[#e03131]"
          icon={<CamIcon />}
        />
        <div className="w-px h-6 bg-[#e4e4e4] mx-1" />
        <button
          type="button"
          onClick={handleLeave}
          className="h-10 px-4 rounded-xl bg-[#fff1f0] hover:bg-[#ffe3e2] text-[#e03131] text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          나가기
        </button>
      </div>
    </div>
  );
}

function VideoTile({ stream, name }: { stream: MediaStream; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = stream.getVideoTracks().some((t) => t.enabled);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="w-28 h-20 rounded-xl bg-white/10 border border-white/10 overflow-hidden backdrop-blur-sm">
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline className="hidden" />
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-sm font-semibold">{name[0]?.toUpperCase()}</span>
            </div>
            <span className="text-white/50 text-[10px]">{name}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ControlButton({ active, onClick, label, activeColor, inactiveColor, icon }: {
  active: boolean; onClick: () => void; label: string;
  activeColor: string; inactiveColor: string; icon: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={label}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${active ? activeColor : inactiveColor}`}
    >
      {icon}
    </button>
  );
}

function MicOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
