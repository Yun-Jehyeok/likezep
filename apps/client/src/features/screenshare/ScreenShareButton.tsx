interface Props {
  isSharing: boolean;
  onStart(): void;
  onStop(): void;
}

export function ScreenShareButton({ isSharing, onStart, onStop }: Props) {
  return (
    <button
      type="button"
      onClick={isSharing ? onStop : onStart}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-5 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors ${
        isSharing ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
      }`}
    >
      {isSharing ? "공유 중지" : "화면 공유"}
    </button>
  );
}
