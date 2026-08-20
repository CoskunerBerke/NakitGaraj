-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VehicleEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleSpecificationId" TEXT,
    "vehicleMake" TEXT,
    "vehicleModel" TEXT,
    "vehicleEngine" TEXT,
    "vehicleTrim" TEXT,
    "vehicleYear" INTEGER,
    "vehicleBodyType" TEXT,
    "licensePlate" TEXT NOT NULL,
    "mileage" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "damageStatus" TEXT NOT NULL,
    "damageDetails" TEXT,
    "estimatedValue" REAL NOT NULL,
    "minExpectedValue" REAL NOT NULL,
    "maxExpectedValue" REAL NOT NULL,
    "quickSaleValue" REAL NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 90,
    "aiAnalysis" TEXT NOT NULL,
    "userIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "sellingTimeline" TEXT,
    "userDesiredPrice" REAL,
    "finalOfferedPrice" REAL,
    "features" TEXT,
    CONSTRAINT "VehicleEvaluation_vehicleSpecificationId_fkey" FOREIGN KEY ("vehicleSpecificationId") REFERENCES "VehicleSpecification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VehicleEvaluation" ("aiAnalysis", "color", "confidenceScore", "createdAt", "damageDetails", "damageStatus", "estimatedValue", "features", "finalOfferedPrice", "firstName", "id", "lastName", "licensePlate", "maxExpectedValue", "mileage", "minExpectedValue", "phone", "quickSaleValue", "sellingTimeline", "userDesiredPrice", "userIp", "vehicleSpecificationId") SELECT "aiAnalysis", "color", "confidenceScore", "createdAt", "damageDetails", "damageStatus", "estimatedValue", "features", "finalOfferedPrice", "firstName", "id", "lastName", "licensePlate", "maxExpectedValue", "mileage", "minExpectedValue", "phone", "quickSaleValue", "sellingTimeline", "userDesiredPrice", "userIp", "vehicleSpecificationId" FROM "VehicleEvaluation";
DROP TABLE "VehicleEvaluation";
ALTER TABLE "new_VehicleEvaluation" RENAME TO "VehicleEvaluation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
