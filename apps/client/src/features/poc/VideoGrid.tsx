import { useEffect, useRef } from "react";
import { useGameStore } from "../../core/store/gameStore.js";

export function VideoGrid() {
  const remoteStreams = useGameStore((s) => s.remoteStreams);

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 10,
      }}
    >
      {[...remoteStreams.entries()].map(([peerId, stream]) => (
        <VideoTile key={peerId} stream={stream} />
      ))}
    </div>
  );
}

function VideoTile({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={false}
      style={{
        width: 160,
        height: 120,
        backgroundColor: "#000",
        borderRadius: 6,
        border: "1px solid #444",
        objectFit: "cover",
      }}
    />
  );
}
