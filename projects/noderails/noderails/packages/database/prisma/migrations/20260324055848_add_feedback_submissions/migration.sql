-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('FEATURE_REQUEST', 'CHAIN_REQUEST', 'GENERAL_FEEDBACK');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'CLOSED');

-- CreateTable
CREATE TABLE "feedback_submissions" (
    "id" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "source" VARCHAR(100),
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "reviewedBy" VARCHAR(255),
    "reviewedAt" TIMESTAMP(3),
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_submissions_status_idx" ON "feedback_submissions"("status");

-- CreateIndex
CREATE INDEX "feedback_submissions_type_idx" ON "feedback_submissions"("type");

-- CreateIndex
CREATE INDEX "feedback_submissions_createdAt_idx" ON "feedback_submissions"("createdAt");
