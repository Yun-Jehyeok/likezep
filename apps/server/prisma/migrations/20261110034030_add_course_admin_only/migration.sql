-- AlterTable
ALTER TABLE "courses" ADD COLUMN "is_admin_only" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
DROP INDEX "courses_category_is_published_idx";

-- CreateIndex
CREATE INDEX "courses_category_is_published_is_admin_only_idx" ON "courses"("category", "is_published", "is_admin_only");
