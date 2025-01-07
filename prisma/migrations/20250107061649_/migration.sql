/*
  Warnings:

  - Added the required column `summary_2x` to the `Search` table without a default value. This is not possible if the table is not empty.
  - Added the required column `summary_3x` to the `Search` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Search" ADD COLUMN     "summary_2x" TEXT NOT NULL,
ADD COLUMN     "summary_3x" TEXT NOT NULL;
