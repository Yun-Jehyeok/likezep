import { Router, type Router as ExpressRouter } from "express";
import { randomUUID } from "crypto";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  createCourse,
  updateCourse,
  deleteCourse,
  createLesson,
  updateLesson,
  deleteLesson,
  createMaterial,
  deleteMaterial,
} from "../../db/coursesRepository.js";
import { getUploadSignedUrl, deleteObject } from "../../lib/s3.js";
import { config } from "../../config.js";

const router: ExpressRouter = Router();

// 모든 라우트에 admin 인증 적용
router.use(requireAuth, requireAdmin);

// POST /api/admin/courses — 강의 생성
router.post("/", async (req, res) => {
  const { category, title, description, order } = req.body as {
    category?: string; title?: string; description?: string; order?: number;
  };

  if (!category?.trim() || !title?.trim()) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "category and title are required" } });
    return;
  }

  const course = await createCourse({
    category: category.trim(),
    title: title.trim(),
    description: description?.trim(),
    order: order ?? 0,
  });

  res.status(201).json({ id: course.id });
});

// PUT /api/admin/courses/:courseId — 강의 수정
router.put("/:courseId", async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (isNaN(courseId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    return;
  }

  const { title, category, description, thumbnail, order, isPublished } = req.body as {
    title?: string; category?: string; description?: string;
    thumbnail?: string; order?: number; isPublished?: boolean;
  };

  const data: Parameters<typeof updateCourse>[1] = {};
  if (title !== undefined) data.title = title;
  if (category !== undefined) data.category = category;
  if (description !== undefined) data.description = description;
  if (thumbnail !== undefined) data.thumbnail = thumbnail;
  if (order !== undefined) data.order = order;
  if (isPublished !== undefined) data.isPublished = isPublished;

  await updateCourse(courseId, data);
  res.json({ ok: true });
});

// DELETE /api/admin/courses/:courseId — 강의 삭제 (CASCADE)
router.delete("/:courseId", async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (isNaN(courseId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    return;
  }

  await deleteCourse(courseId);
  res.json({ ok: true });
});

// POST /api/admin/courses/:courseId/lessons — 레슨 생성
router.post("/:courseId/lessons", async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (isNaN(courseId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    return;
  }

  const { title, videoKey, duration, description, order } = req.body as {
    title?: string; videoKey?: string; duration?: number; description?: string; order?: number;
  };

  if (!title?.trim() || !videoKey?.trim()) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "title and videoKey are required" } });
    return;
  }

  const lesson = await createLesson({
    courseId,
    title: title.trim(),
    videoKey: videoKey.trim(),
    duration,
    description: description?.trim(),
    order: order ?? 0,
  });

  res.status(201).json({ id: lesson.id });
});

// PUT /api/admin/courses/:courseId/lessons/:lessonId — 레슨 수정
router.put("/:courseId/lessons/:lessonId", async (req, res) => {
  const lessonId = Number(req.params.lessonId);
  if (isNaN(lessonId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Lesson not found" } });
    return;
  }

  const { title, description, videoKey, duration, order, isPublished } = req.body as {
    title?: string; description?: string; videoKey?: string;
    duration?: number; order?: number; isPublished?: boolean;
  };

  const data: Parameters<typeof updateLesson>[1] = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (videoKey !== undefined) data.videoKey = videoKey;
  if (duration !== undefined) data.duration = duration;
  if (order !== undefined) data.order = order;
  if (isPublished !== undefined) data.isPublished = isPublished;

  await updateLesson(lessonId, data);
  res.json({ ok: true });
});

// DELETE /api/admin/courses/:courseId/lessons/:lessonId — 레슨 삭제
router.delete("/:courseId/lessons/:lessonId", async (req, res) => {
  const lessonId = Number(req.params.lessonId);
  if (isNaN(lessonId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Lesson not found" } });
    return;
  }

  await deleteLesson(lessonId);
  res.json({ ok: true });
});

// POST /api/admin/courses/:courseId/materials/upload-url — 자료 업로드 presigned URL 발급
router.post("/:courseId/materials/upload-url", async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (isNaN(courseId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    return;
  }

  const { filename, contentType, fileSize } = req.body as {
    filename?: string; contentType?: string; fileSize?: number;
  };

  if (!filename?.trim() || !contentType?.trim()) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "filename and contentType are required" } });
    return;
  }

  // 파일명에서 slug 생성 (공백→하이픈, 특수문자 제거)
  const slug = filename.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9가-힣._-]/g, "");
  const fileKey = `courses/${courseId}/materials/${randomUUID()}-${slug}`;

  // DB에 material 레코드 선등록 (업로드 실패 시 orphan 허용 — 주기적 정리)
  const material = await createMaterial({
    courseId,
    name: filename.trim(),
    fileKey,
    fileSize,
    order: 0,
  });

  const bucket = config.S3_VIDEOS_BUCKET;
  const region = config.AWS_VIDEOS_REGION;
  const uploadUrl = await getUploadSignedUrl(fileKey, contentType.trim(), 600);

  // uploadUrl은 s3.ts에서 버킷명을 참조하므로 별도 endpoint URL 구성 불필요
  void bucket; void region;

  res.json({ uploadUrl, fileKey, materialId: material.id });
});

// DELETE /api/admin/courses/:courseId/materials/:materialId — 자료 삭제 (S3 포함)
router.delete("/:courseId/materials/:materialId", async (req, res) => {
  const materialId = Number(req.params.materialId);
  if (isNaN(materialId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Material not found" } });
    return;
  }

  const courseId = Number(req.params.courseId);
  const material = await deleteMaterial(materialId);

  if (!material || material.courseId !== courseId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Material not found" } });
    return;
  }

  try {
    await deleteObject(material.fileKey);
  } catch {
    // S3 삭제 실패는 무시 (orphan cleanup으로 처리)
  }

  res.json({ ok: true });
});

export { router as adminCoursesRouter };
