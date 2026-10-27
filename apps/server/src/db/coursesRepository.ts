import { prisma } from "./client.js";

export interface CourseListItem {
  id: number;
  category: string;
  title: string;
  description: string | null;
  thumbnail: string | null; // raw S3 key — URL 변환은 라우터에서
  lessonCount: number;
  completedCount: number;
}

export interface CourseDetail {
  id: number;
  category: string;
  title: string;
  description: string | null;
  lessons: {
    id: number;
    title: string;
    duration: number | null;
    order: number;
    completed: boolean;
    watchedSeconds: number;
  }[];
  materials: {
    id: number;
    name: string;
    fileSize: number | null;
  }[];
  lessonCount: number;
  completedCount: number;
}

/** 발행된 강의 목록 + 사용자별 완료 수 */
export async function findAllPublished(userId: string, category?: string): Promise<CourseListItem[]> {
  const [courses, progressRows] = await Promise.all([
    prisma.course.findMany({
      where: {
        isPublished: true,
        ...(category ? { category } : {}),
      },
      include: {
        _count: { select: { lessons: { where: { isPublished: true } } } },
      },
      orderBy: { order: "asc" },
    }),
    prisma.userLessonProgress.groupBy({
      by: ["courseId"],
      where: { userId, completed: true },
      _count: { lessonId: true },
    }),
  ]);

  const completedMap = new Map(progressRows.map((r) => [r.courseId, r._count.lessonId]));

  return courses.map((c) => ({
    id: c.id,
    category: c.category,
    title: c.title,
    description: c.description,
    thumbnail: c.thumbnail,
    lessonCount: c._count.lessons,
    completedCount: completedMap.get(c.id) ?? 0,
  }));
}

/** 발행된 강의 상세 (레슨 + 자료 + 사용자 진행률 포함) */
export async function findPublishedById(courseId: number, userId: string): Promise<CourseDetail | null> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, isPublished: true },
    include: {
      lessons: {
        where: { isPublished: true },
        orderBy: { order: "asc" },
        include: {
          progress: { where: { userId } },
        },
      },
      materials: { orderBy: { order: "asc" } },
    },
  });

  if (!course) return null;

  const completedCount = course.lessons.filter((l) => l.progress[0]?.completed).length;

  return {
    id: course.id,
    category: course.category,
    title: course.title,
    description: course.description,
    lessons: course.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      duration: l.duration,
      order: l.order,
      completed: l.progress[0]?.completed ?? false,
      watchedSeconds: l.progress[0]?.watchedSeconds ?? 0,
    })),
    materials: course.materials.map((m) => ({
      id: m.id,
      name: m.name,
      fileSize: m.fileSize,
    })),
    lessonCount: course.lessons.length,
    completedCount,
  };
}

/** 발행된 레슨의 videoKey 조회 (presigned URL 발급용) */
export async function findPublishedLesson(
  courseId: number,
  lessonId: number
): Promise<{ videoKey: string } | null> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, courseId, isPublished: true, course: { isPublished: true } },
    select: { videoKey: true },
  });
  return lesson;
}

/** 자료 조회 (download presigned URL 발급용) */
export async function findMaterial(
  courseId: number,
  materialId: number
): Promise<{ fileKey: string; name: string } | null> {
  const material = await prisma.material.findFirst({
    where: { id: materialId, courseId, course: { isPublished: true } },
    select: { fileKey: true, name: true },
  });
  return material;
}

/** 진행률 upsert — completed는 한 번 true가 되면 false로 되돌리지 않는다 */
export async function upsertProgress(
  userId: string,
  courseId: number,
  lessonId: number,
  data: { watchedSeconds: number; completed: boolean }
): Promise<void> {
  await prisma.userLessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      courseId,
      lessonId,
      watchedSeconds: data.watchedSeconds,
      completed: data.completed,
    },
    update: {
      watchedSeconds: data.watchedSeconds,
      // completed가 이미 true인 경우 false로 되돌리지 않음
      ...(data.completed ? { completed: true } : {}),
    },
  });
}

// ──────────────────────────────────────────
// 관리자 전용 함수
// ──────────────────────────────────────────

export async function createCourse(data: {
  category: string;
  title: string;
  description?: string;
  order?: number;
}) {
  return prisma.course.create({ data });
}

export async function updateCourse(
  courseId: number,
  data: Partial<{ title: string; category: string; description: string; thumbnail: string; order: number; isPublished: boolean }>
) {
  return prisma.course.update({ where: { id: courseId }, data });
}

export async function deleteCourse(courseId: number) {
  return prisma.course.delete({ where: { id: courseId } });
}

export async function createLesson(data: {
  courseId: number;
  title: string;
  videoKey: string;
  duration?: number;
  description?: string;
  order?: number;
}) {
  return prisma.lesson.create({ data });
}

export async function updateLesson(
  lessonId: number,
  data: Partial<{ title: string; description: string; videoKey: string; duration: number; order: number; isPublished: boolean }>
) {
  return prisma.lesson.update({ where: { id: lessonId }, data });
}

export async function deleteLesson(lessonId: number) {
  return prisma.lesson.delete({ where: { id: lessonId } });
}

export async function createMaterial(data: {
  courseId: number;
  name: string;
  fileKey: string;
  fileSize?: number;
  order?: number;
}) {
  return prisma.material.create({ data });
}

export async function deleteMaterial(materialId: number) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) return null;
  await prisma.material.delete({ where: { id: materialId } });
  return material;
}
