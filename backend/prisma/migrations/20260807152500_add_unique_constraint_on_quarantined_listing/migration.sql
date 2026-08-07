-- Clean up duplicate QuarantinedListing records before applying the unique index constraint
DELETE FROM "QuarantinedListing"
WHERE id NOT IN (
    SELECT MIN(id)
    FROM "QuarantinedListing"
    GROUP BY "source", "rawListingId", "reason"
);

-- RedefineTable
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuarantinedListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'SAHIBINDEN_HTML',
    "rawListingId" TEXT NOT NULL,
    "rawMake" TEXT,
    "rawModel" TEXT,
    "rawVariant" TEXT,
    "rawTitle" TEXT,
    "sourceFile" TEXT,
    "reason" TEXT NOT NULL,
    "quarantinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_QuarantinedListing" ("id", "rawListingId", "rawMake", "rawModel", "rawVariant", "rawTitle", "sourceFile", "reason", "quarantinedAt") SELECT "id", COALESCE("rawListingId", ''), "rawMake", "rawModel", "rawVariant", "rawTitle", "sourceFile", "reason", "quarantinedAt" FROM "QuarantinedListing";
DROP TABLE "QuarantinedListing";
ALTER TABLE "new_QuarantinedListing" RENAME TO "QuarantinedListing";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "QuarantinedListing_source_rawListingId_reason_key" ON "QuarantinedListing"("source", "rawListingId", "reason");
