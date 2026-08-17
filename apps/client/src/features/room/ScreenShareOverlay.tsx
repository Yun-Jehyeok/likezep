import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
  presenterName: string;
  onClose?: () => void;
}

export function ScreenShareOverlay({ stream, presenterName, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 backdrop-blur-sm">
      <div className="w-full h-full flex flex-col px-6 py-4">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-white text-sm font-medium">{presenterName} 화면 공유 중</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black min-h-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain block"
          />
        </div>
      </div>
    </div>
  );
}
