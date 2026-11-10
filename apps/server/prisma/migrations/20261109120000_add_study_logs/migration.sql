-- CreateTable
CREATE TABLE "study_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "study_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_logs_user_id_date_key" ON "study_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "study_logs_user_id_idx" ON "study_logs"("user_id");

-- CreateIndex
CREATE INDEX "study_logs_date_idx" ON "study_logs"("date");

-- AddForeignKey
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
