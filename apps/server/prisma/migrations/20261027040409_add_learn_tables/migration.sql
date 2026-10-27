-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "video_key" TEXT NOT NULL,
    "duration" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_size" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_lesson_progress" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" INTEGER NOT NULL,
    "lesson_id" INTEGER NOT NULL,
    "watched_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_category_is_published_idx" ON "courses"("category", "is_published");

-- CreateIndex
CREATE INDEX "lessons_course_id_order_idx" ON "lessons"("course_id", "order");

-- CreateIndex
CREATE INDEX "user_lesson_progress_user_id_course_id_idx" ON "user_lesson_progress"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_lesson_progress_user_id_lesson_id_key" ON "user_lesson_progress"("user_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
