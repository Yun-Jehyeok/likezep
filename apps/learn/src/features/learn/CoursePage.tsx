import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type CourseDetail, type LessonItem } from "../../api";

type Tab = "description" | "materials";

function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CoursePage() {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>("description");
    const [course, setCourse] = useState<CourseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentLessonId, setCurrentLessonId] = useState<number | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    // locally-completed lesson IDs not yet reflected in server response
    const [localCompleted, setLocalCompleted] = useState<Set<number>>(new Set());

    const videoRef = useRef<HTMLVideoElement>(null);
    const currentLessonIdRef = useRef<number | null>(null);
    const currentLessonRef = useRef<LessonItem | null>(null);
    const lastSaveTimeRef = useRef<number>(0);
    const pendingProgressRef = useRef<{ watchedSeconds: number; completed: boolean } | null>(null);
    const urlRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localCompletedRef = useRef<Set<number>>(new Set());

    useEffect(() => { currentLessonIdRef.current = currentLessonId; }, [currentLessonId]);
    useEffect(() => { localCompletedRef.current = localCompleted; }, [localCompleted]);

    // Keep currentLessonRef in sync
    useEffect(() => {
        currentLessonRef.current = course?.lessons.find((l) => l.id === currentLessonId) ?? null;
    }, [course, currentLessonId]);

    // Fetch course detail
    useEffect(() => {
        if (!courseId) return;
        api.get<CourseDetail>(`/api/courses/${courseId}`)
            .then((data) => {
                setCourse(data);
                if (data.lessons.length > 0) {
                    const first = data.lessons.find((l) => !l.completed) ?? data.lessons[0];
                    setCurrentLessonId(first.id);
                }
            })
            .catch(() => navigate(".."))
            .finally(() => setLoading(false));
    }, [courseId, navigate]);

    // Fetch video URL when lesson changes, schedule refresh before expiry
    useEffect(() => {
        if (!courseId || !currentLessonId) return;
        setVideoUrl(null);
        if (urlRefreshTimerRef.current) clearTimeout(urlRefreshTimerRef.current);

        const fetchUrl = (lessonId: number) => {
            api.get<{ url: string; expiresIn: number }>(
                `/api/courses/${courseId}/lessons/${lessonId}/video-url`
            ).then(({ url, expiresIn }) => {
                if (currentLessonIdRef.current !== lessonId) return;
                setVideoUrl(url);
                urlRefreshTimerRef.current = setTimeout(
                    () => { if (currentLessonIdRef.current === lessonId) fetchUrl(lessonId); },
                    (expiresIn - 60) * 1000
                );
            }).catch(() => {});
        };

        fetchUrl(currentLessonId);
        return () => { if (urlRefreshTimerRef.current) clearTimeout(urlRefreshTimerRef.current); };
    }, [courseId, currentLessonId]);

    // Flush progress on page unload via fetch keepalive
    useEffect(() => {
        const flush = () => {
            const progress = pendingProgressRef.current;
            const lessonId = currentLessonIdRef.current;
            if (!progress || !lessonId || !courseId) return;
            const token = sessionStorage.getItem("auth_token");
            fetch(`/api/courses/${courseId}/lessons/${lessonId}/progress`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(progress),
                keepalive: true,
            });
        };
        window.addEventListener("beforeunload", flush);
        return () => window.removeEventListener("beforeunload", flush);
    }, [courseId]);

    const handleTimeUpdate = useCallback(() => {
        const video = videoRef.current;
        const lesson = currentLessonRef.current;
        if (!video || !lesson || !courseId) return;

        const watchedSeconds = Math.floor(video.currentTime);
        const alreadyCompleted = lesson.completed || localCompletedRef.current.has(lesson.id);
        const completed =
            alreadyCompleted ||
            (lesson.duration != null && lesson.duration > 0 && watchedSeconds >= lesson.duration * 0.9);

        pendingProgressRef.current = { watchedSeconds, completed };

        const now = Date.now();
        if (now - lastSaveTimeRef.current < 5000) return;
        lastSaveTimeRef.current = now;

        api.post(`/api/courses/${courseId}/lessons/${lesson.id}/progress`, { watchedSeconds, completed })
            .then(() => {
                if (completed && !alreadyCompleted) {
                    setLocalCompleted((prev) => new Set([...prev, lesson.id]));
                }
            })
            .catch(() => {});
    }, [courseId]);

    // Seek to last watched position when video metadata loads
    const handleLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        const lesson = currentLessonRef.current;
        if (!video || !lesson) return;
        if (
            lesson.watchedSeconds > 0 &&
            lesson.duration != null &&
            lesson.watchedSeconds < lesson.duration * 0.95
        ) {
            video.currentTime = lesson.watchedSeconds;
        }
    }, []);

    const selectLesson = useCallback((lessonId: number) => {
        const prev = pendingProgressRef.current;
        const prevId = currentLessonIdRef.current;
        // Flush pending progress before switching
        if (prev && prevId && prevId !== lessonId) {
            api.post(`/api/courses/${courseId}/lessons/${prevId}/progress`, prev).catch(() => {});
            pendingProgressRef.current = null;
            lastSaveTimeRef.current = 0;
        }
        setCurrentLessonId(lessonId);
    }, [courseId]);

    const downloadMaterial = useCallback(async (materialId: number) => {
        try {
            const { url } = await api.get<{ url: string; expiresIn: number; filename: string }>(
                `/api/courses/${courseId}/materials/${materialId}/download-url`
            );
            window.open(url, "_blank", "noopener");
        } catch {
            // silently ignore
        }
    }, [courseId]);

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-background">
                <div className="w-8 h-8 border-2 border-[#0071ff] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    if (!course) return null;

    const currentLesson = course.lessons.find((l) => l.id === currentLessonId);
    const serverCompletedIds = new Set(course.lessons.filter((l) => l.completed).map((l) => l.id));
    const newlyCompleted = [...localCompleted].filter((id) => !serverCompletedIds.has(id));
    const displayCompletedCount = course.completedCount + newlyCompleted.length;
    const progress = course.lessonCount > 0
        ? Math.round((displayCompletedCount / course.lessonCount) * 100)
        : 0;
    const isCompleted = (l: LessonItem) => l.completed || localCompleted.has(l.id);

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
                    <span className="text-[15px] text-text-primary truncate">{course.title}</span>
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
                        {videoUrl ? (
                            <video
                                ref={videoRef}
                                key={videoUrl}
                                src={videoUrl}
                                controls
                                className="w-full h-full"
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={handleLoadedMetadata}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            </div>
                        )}
                    </div>

                    {/* Lesson info + tabs */}
                    <div className="px-8 py-6">
                        <h2 className="text-lg font-semibold text-text-primary mb-5">
                            {currentLesson?.title ?? "강의를 선택하세요"}
                        </h2>

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

                        {activeTab === "description" && (
                            <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-line">
                                {course.description ?? "강의 설명이 없습니다."}
                            </p>
                        )}

                        {activeTab === "materials" && (
                            course.materials.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {course.materials.map((m) => (
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
                                                    <p className="text-[11px] text-text-disabled">{formatFileSize(m.fileSize)}</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => downloadMaterial(m.id)}
                                                className="flex items-center gap-1.5 text-[13px] font-medium text-[#0071ff] opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <DownloadIcon />
                                                다운로드
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[14px] text-text-disabled">등록된 학습 자료가 없습니다.</p>
                            )
                        )}
                    </div>
                </div>

                {/* Right: lesson list */}
                <div className="w-80 border-l border-border bg-white flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-border shrink-0">
                        <h3 className="text-[13px] font-semibold text-text-primary mb-3 leading-snug line-clamp-2">
                            {course.title}
                        </h3>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[12px] text-text-secondary">
                                {displayCompletedCount} / {course.lessonCount}강 완료
                            </span>
                            <span className="text-[12px] font-semibold text-[#0071ff]">{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                            <div className="h-full bg-[#0071ff] rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {course.lessons.map((lesson, idx) => {
                            const isCurrent = lesson.id === currentLessonId;
                            const done = isCompleted(lesson);
                            return (
                                <button
                                    key={lesson.id}
                                    type="button"
                                    onClick={() => selectLesson(lesson.id)}
                                    className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors border-b border-border/50 last:border-b-0 ${
                                        isCurrent ? "bg-[#e8f1ff]" : "hover:bg-[#f4f6f9]"
                                    }`}
                                >
                                    {/* Status icon */}
                                    <div className="shrink-0 mt-0.5">
                                        {done ? (
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
                                        <p className={`text-[13px] font-medium leading-snug line-clamp-2 ${
                                            isCurrent ? "text-[#0071ff]"
                                            : done ? "text-text-secondary"
                                            : "text-text-primary"
                                        }`}>
                                            {lesson.title}
                                        </p>
                                        <p className="text-[11px] text-text-disabled mt-0.5 tabular-nums">
                                            {formatDuration(lesson.duration)}
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
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#0071ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" stroke="#0071ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
