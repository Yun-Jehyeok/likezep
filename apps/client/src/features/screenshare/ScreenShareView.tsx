import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
}

export function ScreenShareView({ stream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 480,
        background: "#000",
        borderRadius: 8,
        overflow: "hidden",
        border: "2px solid #3182ce",
        zIndex: 10,
      }}
    >
      <div style={{ padding: "4px 8px", background: "#3182ce", color: "#fff", fontSize: 12 }}>
        화면 공유 중
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", display: "block" }}
      />
    </div>
  );
}
