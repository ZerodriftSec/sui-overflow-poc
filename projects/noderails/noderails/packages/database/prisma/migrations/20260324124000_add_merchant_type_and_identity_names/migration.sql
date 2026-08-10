-- CreateEnum
CREATE TYPE "MerchantType" AS ENUM ('BUSINESS', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "merchants"
ADD COLUMN "merchantType" "MerchantType" NOT NULL DEFAULT 'BUSINESS',
ADD COLUMN "businessName" VARCHAR(200),
ADD COLUMN "individualName" VARCHAR(200);
