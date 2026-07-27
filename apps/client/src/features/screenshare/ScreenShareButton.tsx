interface Props {
  isSharing: boolean;
  onStart(): void;
  onStop(): void;
}

export function ScreenShareButton({ isSharing, onStart, onStop }: Props) {
  return (
    <button
      onClick={isSharing ? onStop : onStart}
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 20px",
        background: isSharing ? "#e53e3e" : "#3182ce",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 14,
        zIndex: 10,
      }}
    >
      {isSharing ? "공유 중지" : "화면 공유"}
    </button>
  );
}
