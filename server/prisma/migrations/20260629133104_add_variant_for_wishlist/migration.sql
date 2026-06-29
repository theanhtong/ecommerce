/*
  Warnings:

  - Added the required column `variantId` to the `wishlists` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "wishlists" ADD COLUMN     "variantId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
