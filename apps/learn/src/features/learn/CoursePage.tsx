import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Tab = "description" | "materials";

const MOCK_COURSE = {
    title: "코딩테스트 완전 정복",
    description:
        "DFS/BFS, 동적 프로그래밍, 그래프 이론 등 코딩테스트 핵심 알고리즘을 단계별로 학습합니다.\n\n각 챕터마다 핵심 개념을 먼저 학습하고, 실제 문제 풀이를 통해 적용하는 방식으로 진행됩니다. 모든 예제는 Python과 JavaScript로 제공되며, 단계별 난이도로 구성되어 처음 코딩테스트를 준비하는 분도 부담 없이 시작할 수 있습니다.",
    lessons: [
        { id: "1", title: "강의 소개 및 학습 로드맵", duration: "08:24", completed: true },
        { id: "2", title: "시간복잡도와 공간복잡도", duration: "15:37", completed: true },
        { id: "3", title: "배열과 문자열 다루기", duration: "22:15", completed: true },
        { id: "4", title: "스택과 큐 기초", duration: "18:42", completed: true },
        { id: "5", title: "해시맵 활용법", duration: "20:11", completed: false },
        { id: "6", title: "DFS 기초와 재귀", duration: "25:30", completed: false },
        { id: "7", title: "BFS와 최단경로", duration: "28:44", completed: false },
        { id: "8", title: "동적 프로그래밍 입문", duration: "31:22", completed: false },
        { id: "9", title: "DP 유형별 풀이법", duration: "35:18", completed: false },
        { id: "10", title: "그래프 이론 기초", duration: "24:07", completed: false },
        { id: "11", title: "최소 신장 트리 (MST)", duration: "26:55", completed: false },
        { id: "12", title: "다익스트라 알고리즘", duration: "29:13", completed: false },
    ],
    materials: [
        { id: "1", name: "DFS_BFS_슬라이드.pdf", size: "2.4 MB" },
        { id: "2", name: "DP_문제_모음.pdf", size: "1.8 MB" },
        { id: "3", name: "알고리즘_코드_예제.zip", size: "580 KB" },
    ],
};

export function CoursePage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>("description");
    const [currentLessonId, setCurrentLessonId] = useState("5");

    const currentLesson = MOCK_COURSE.lessons.find((l) => l.id === currentLessonId);
    const completedCount = MOCK_COURSE.lessons.filter((l) => l.completed).length;
    const progress = Math.round((completedCount / MOCK_COURSE.lessons.length) * 100);

    return (
        <div className="h-screen flex flex-col bg-background overflow-hidden">
            {/* GNB */}
            <header className="bg-white border-b border-border px-6 h-14 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#0071ff] flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                            <path d="M4 5h14M4 11h14M4 17h8" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-[15px] font-bold text-text-primary shrink-0">멘토링 플랫폼</span>
                    <span className="text-text-disabled text-sm mx-0.5 shrink-0">/</span>
                    <button
                        type="button"
                        onClick={() => navigate("..")}
                        className="text-[15px] text-text-secondary hover:text-text-primary transition-colors shrink-0"
                    >
                        강의실
                    </button>
                    <span className="text-text-disabled text-sm mx-0.5 shrink-0">/</span>
                    <span className="text-[15px] text-text-primary truncate">{MOCK_COURSE.title}</span>
                </div>
                <button
                    type="button"
                    onClick={() => navigate("..")}
                    className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors shrink-0 ml-4"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    강의 목록
                </button>
            </header>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: player + info */}
                <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
                    {/* Video player */}
                    <div className="bg-black w-full" style={{ aspectRatio: "16/9" }}>
                        <div className="w-full h-full flex flex-col items-center justify-center relative">
                            <button
                                type="button"
                                className="w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors backdrop-blur-sm"
                            >
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </button>
                            {/* Progress bar */}
                            <div className="absolute bottom-0 left-0 right-0">
                                <div className="h-1 bg-white/20">
                                    <div className="h-full bg-[#0071ff] w-[35%]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Lesson info + tabs */}
                    <div className="px-8 py-6">
                        <h2 className="text-lg font-semibold text-text-primary mb-5">
                            {currentLesson?.title ?? "강의를 선택하세요"}
                        </h2>

                        {/* Tab bar */}
                        <div className="flex border-b border-border mb-6">
                            <TabButton
                                label="강의 설명"
                                active={activeTab === "description"}
                                onClick={() => setActiveTab("description")}
                            />
                            <TabButton
                                label="학습 자료"
                                active={activeTab === "materials"}
                                onClick={() => setActiveTab("materials")}
                            />
                        </div>

                        {/* Tab content */}
                        {activeTab === "description" && (
                            <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-line">
                                {MOCK_COURSE.description}
                            </p>
                        )}

                        {activeTab === "materials" && (
                            <div className="flex flex-col gap-3">
                                {MOCK_COURSE.materials.map((m) => (
                                    <div
                                        key={m.id}
                                        className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-white hover:border-[#0071ff] transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-[#e8f1ff] flex items-center justify-center shrink-0">
                                                <FileIcon />
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-medium text-text-primary">{m.name}</p>
                                                <p className="text-[11px] text-text-disabled">{m.size}</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-[13px] font-medium text-[#0071ff] opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <DownloadIcon />
                                            다운로드
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: lesson list */}
                <div className="w-80 border-l border-border bg-white flex flex-col shrink-0">
                    {/* Course header */}
                    <div className="px-5 py-4 border-b border-border shrink-0">
                        <h3 className="text-[13px] font-semibold text-text-primary mb-3 leading-snug line-clamp-2">
                            {MOCK_COURSE.title}
                        </h3>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[12px] text-text-secondary">
                                {completedCount} / {MOCK_COURSE.lessons.length}강 완료
                            </span>
                            <span className="text-[12px] font-semibold text-[#0071ff]">{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#0071ff] rounded-full"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    {/* Lesson list */}
                    <div className="flex-1 overflow-y-auto">
                        {MOCK_COURSE.lessons.map((lesson, idx) => {
                            const isCurrent = lesson.id === currentLessonId;
                            return (
                                <button
                                    key={lesson.id}
                                    type="button"
                                    onClick={() => setCurrentLessonId(lesson.id)}
                                    className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors border-b border-border/50 last:border-b-0 ${
                                        isCurrent ? "bg-[#e8f1ff]" : "hover:bg-[#f4f6f9]"
                                    }`}
                                >
                                    {/* Status icon */}
                                    <div className="shrink-0 mt-0.5">
                                        {lesson.completed ? (
                                            <div className="w-5 h-5 rounded-full bg-[#1a7a3f] flex items-center justify-center">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                                    <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                        ) : isCurrent ? (
                                            <div className="w-5 h-5 rounded-full bg-[#0071ff] flex items-center justify-center">
                                                <svg width="7" height="9" viewBox="0 0 8 10" fill="white">
                                                    <path d="M1 1.5l6 3.5-6 3.5V1.5z" />
                                                </svg>
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-full border-2 border-border" />
                                        )}
                                    </div>

                                    {/* Lesson info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-[11px] text-text-disabled tabular-nums">
                                                {String(idx + 1).padStart(2, "0")}
                                            </span>
                                            {isCurrent && (
                                                <span className="text-[10px] font-semibold text-[#0071ff] bg-[#0071ff]/10 px-1.5 py-0.5 rounded">
                                                    수강 중
                                                </span>
                                            )}
                                        </div>
                                        <p
                                            className={`text-[13px] font-medium leading-snug line-clamp-2 ${
                                                isCurrent
                                                    ? "text-[#0071ff]"
                                                    : lesson.completed
                                                      ? "text-text-secondary"
                                                      : "text-text-primary"
                                            }`}
                                        >
                                            {lesson.title}
                                        </p>
                                        <p className="text-[11px] text-text-disabled mt-0.5 tabular-nums">
                                            {lesson.duration}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                    ? "border-[#0071ff] text-[#0071ff]"
                    : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
        >
            {label}
        </button>
    );
}

function FileIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
                d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                stroke="#0071ff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M14 2v6h6" stroke="#0071ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
