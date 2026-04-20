/*
  Warnings:

  - Added the required column `address` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Customer` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "customer_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customer_name" TEXT NOT NULL,
    "credit_score" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "drivers_license_id" INTEGER NOT NULL,
    "credit_card_number" INTEGER NOT NULL,
    CONSTRAINT "Customer_drivers_license_id_fkey" FOREIGN KEY ("drivers_license_id") REFERENCES "Driver's License" ("drivers_license_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Customer_credit_card_number_fkey" FOREIGN KEY ("credit_card_number") REFERENCES "Credit card" ("credit_card_number") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_Customer" ("credit_card_number", "credit_score", "customer_id", "customer_name", "drivers_license_id") SELECT "credit_card_number", "credit_score", "customer_id", "customer_name", "drivers_license_id" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
