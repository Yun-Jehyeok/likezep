import { Router, type Router as ExpressRouter } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  findAllPublished,
  findPublishedById,
  findPublishedLesson,
  findMaterial,
  upsertProgress,
} from "../../db/coursesRepository.js";
import { getThumbnailUrl, getVideoSignedUrl, getDownloadSignedUrl } from "../../lib/s3.js";

const router: ExpressRouter = Router();

// GET /api/courses — 발행된 강의 목록 (카테고리 필터 선택)
router.get("/", requireAuth, async (req, res) => {
  const { category } = req.query as { category?: string };
  const userId = req.auth!.userId;

  const courses = await findAllPublished(userId, category || undefined);

  const withThumbnails = await Promise.all(
    courses.map(async (c) => ({
      ...c,
      thumbnail: await getThumbnailUrl(c.thumbnail),
    }))
  );

  res.json(withThumbnails);
});

// GET /api/courses/:courseId — 강의 상세 (레슨 + 자료 + 진행률)
router.get("/:courseId", requireAuth, async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (isNaN(courseId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    return;
  }

  const course = await findPublishedById(courseId, req.auth!.userId);
  if (!course) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    return;
  }

  res.json(course);
});

// GET /api/courses/:courseId/lessons/:lessonId/video-url — presigned 영상 URL 발급
router.get("/:courseId/lessons/:lessonId/video-url", requireAuth, async (req, res) => {
  const courseId = Number(req.params.courseId);
  const lessonId = Number(req.params.lessonId);

  if (isNaN(courseId) || isNaN(lessonId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Lesson not found" } });
    return;
  }

  const lesson = await findPublishedLesson(courseId, lessonId);
  if (!lesson) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Lesson not found" } });
    return;
  }

  const url = await getVideoSignedUrl(lesson.videoKey, 3600);
  res.json({ url, expiresIn: 3600 });
});

// GET /api/courses/:courseId/materials/:materialId/download-url — presigned 다운로드 URL 발급
router.get("/:courseId/materials/:materialId/download-url", requireAuth, async (req, res) => {
  const courseId = Number(req.params.courseId);
  const materialId = Number(req.params.materialId);

  if (isNaN(courseId) || isNaN(materialId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Material not found" } });
    return;
  }

  const material = await findMaterial(courseId, materialId);
  if (!material) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Material not found" } });
    return;
  }

  const url = await getDownloadSignedUrl(material.fileKey, material.name, 600);
  res.json({ url, expiresIn: 600, filename: material.name });
});

// POST /api/courses/:courseId/lessons/:lessonId/progress — 진행률 저장
router.post("/:courseId/lessons/:lessonId/progress", requireAuth, async (req, res) => {
  const courseId = Number(req.params.courseId);
  const lessonId = Number(req.params.lessonId);
  const { watchedSeconds, completed } = req.body as { watchedSeconds?: unknown; completed?: unknown };

  if (isNaN(courseId) || isNaN(lessonId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Lesson not found" } });
    return;
  }

  if (typeof watchedSeconds !== "number" || watchedSeconds < 0) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "watchedSeconds must be a non-negative number" } });
    return;
  }

  // 레슨 존재 + 발행 여부 확인
  const lesson = await findPublishedLesson(courseId, lessonId);
  if (!lesson) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Lesson not found" } });
    return;
  }

  await upsertProgress(req.auth!.userId, courseId, lessonId, {
    watchedSeconds,
    completed: completed === true,
  });

  res.json({ ok: true });
});

export { router as coursesRouter };
