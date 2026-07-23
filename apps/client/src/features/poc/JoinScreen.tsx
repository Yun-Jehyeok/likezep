import { useState } from "react";

interface Props {
  onJoin(name: string): void;
}

export function JoinScreen({ onJoin }: Props) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onJoin(trimmed);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#1a1a2e",
        color: "#e0e0e0",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 32, fontSize: 28 }}>멘토링 플랫폼 PoC</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="text"
          placeholder="이름을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{
            padding: "10px 16px",
            fontSize: 16,
            borderRadius: 6,
            border: "1px solid #444",
            background: "#2a2a3e",
            color: "#e0e0e0",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!name.trim()}
          style={{
            padding: "10px 24px",
            fontSize: 16,
            borderRadius: 6,
            border: "none",
            background: name.trim() ? "#3b82f6" : "#374151",
            color: "#fff",
            cursor: name.trim() ? "pointer" : "not-allowed",
          }}
        >
          입장
        </button>
      </form>
    </div>
  );
}
