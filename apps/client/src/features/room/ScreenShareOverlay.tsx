import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
}

export function ScreenShareOverlay({ stream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-20 backdrop-blur-sm">
      <div className="w-full max-w-4xl mx-6 rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
        <div className="bg-white/10 px-4 py-2.5 flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-white text-sm font-medium">화면 공유 중</span>
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full block bg-black"
        />
      </div>
    </div>
  );
}
