-- AlterTable
ALTER TABLE "query_history" ADD COLUMN     "dataset_id" TEXT NOT NULL DEFAULT 'sales',
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "repaired" BOOLEAN NOT NULL DEFAULT false;
