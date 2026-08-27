-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "isBangladesh" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Job_isBangladesh_idx" ON "Job"("isBangladesh");

-- CreateIndex
CREATE INDEX "Job_lastSeenAt_idx" ON "Job"("lastSeenAt");
