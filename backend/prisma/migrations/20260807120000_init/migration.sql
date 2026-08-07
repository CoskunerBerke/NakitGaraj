-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityName" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "popularityScore" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "popularityScore" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Model_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "engineSize" INTEGER NOT NULL,
    "horsepower" INTEGER NOT NULL,
    "torque" INTEGER NOT NULL,
    "cylinders" INTEGER NOT NULL DEFAULT 4,
    CONSTRAINT "Variant_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    CONSTRAINT "Package_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FuelType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TransmissionType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "BodyType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DriveType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "VehicleSpecification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "packageId" TEXT,
    "bodyTypeId" TEXT NOT NULL,
    "fuelTypeId" TEXT NOT NULL,
    "transmissionTypeId" TEXT NOT NULL,
    "driveTypeId" TEXT NOT NULL,
    "doors" INTEGER NOT NULL DEFAULT 4,
    "seats" INTEGER NOT NULL DEFAULT 5,
    "fuelConsumption" REAL NOT NULL DEFAULT 0,
    "emission" REAL NOT NULL DEFAULT 0,
    "equipmentLevel" TEXT,
    "safetyEquipment" TEXT,
    "originalMSRP" REAL,
    "popularityScore" REAL NOT NULL DEFAULT 5.0,
    "reliabilityScore" REAL NOT NULL DEFAULT 5.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleSpecification_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_bodyTypeId_fkey" FOREIGN KEY ("bodyTypeId") REFERENCES "BodyType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_transmissionTypeId_fkey" FOREIGN KEY ("transmissionTypeId") REFERENCES "TransmissionType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleSpecification_driveTypeId_fkey" FOREIGN KEY ("driveTypeId") REFERENCES "DriveType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleMarketPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleSpecificationId" TEXT NOT NULL,
    "currentMarketAverage" REAL NOT NULL,
    "averageListingPrice" REAL NOT NULL,
    "minPrice" REAL NOT NULL,
    "maxPrice" REAL NOT NULL,
    "regionalPriceDifferences" TEXT NOT NULL,
    "averageSellingTime" INTEGER NOT NULL,
    "cleanMarketAverage" REAL,
    "scrapedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleMarketPrice_vehicleSpecificationId_fkey" FOREIGN KEY ("vehicleSpecificationId") REFERENCES "VehicleSpecification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleSpecificationId" TEXT NOT NULL,
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
    CONSTRAINT "VehicleEvaluation_vehicleSpecificationId_fkey" FOREIGN KEY ("vehicleSpecificationId") REFERENCES "VehicleSpecification" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsignmentApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleEvaluationId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "preferredContact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsignmentApplication_vehicleEvaluationId_fkey" FOREIGN KEY ("vehicleEvaluationId") REFERENCES "VehicleEvaluation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "note" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RawVehicleListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'SAHIBINDEN_HTML',
    "sourceListingId" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceFileHash" TEXT,
    "rawMake" TEXT NOT NULL,
    "rawModel" TEXT NOT NULL,
    "rawVariant" TEXT,
    "rawTitle" TEXT,
    "canonicalMake" TEXT NOT NULL,
    "canonicalModel" TEXT NOT NULL,
    "canonicalVariant" TEXT,
    "canonicalTrim" TEXT,
    "canonicalBodyType" TEXT,
    "canonicalFuelType" TEXT,
    "canonicalTransmission" TEXT,
    "year" INTEGER NOT NULL,
    "mileageKm" INTEGER,
    "price" REAL NOT NULL,
    "city" TEXT,
    "isDamaged" BOOLEAN NOT NULL DEFAULT false,
    "parseStatus" TEXT NOT NULL DEFAULT 'VALID',
    "parseWarnings" TEXT,
    "scrapedAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuarantinedListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawListingId" TEXT,
    "rawMake" TEXT,
    "rawModel" TEXT,
    "rawVariant" TEXT,
    "rawTitle" TEXT,
    "sourceFile" TEXT,
    "reason" TEXT NOT NULL,
    "quarantinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VehicleMarketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "trim" TEXT,
    "year" INTEGER NOT NULL,
    "bodyType" TEXT,
    "fuelType" TEXT,
    "transmission" TEXT,
    "canonicalMake" TEXT NOT NULL DEFAULT '',
    "canonicalModel" TEXT NOT NULL DEFAULT '',
    "canonicalVariant" TEXT NOT NULL DEFAULT '',
    "canonicalTrim" TEXT NOT NULL DEFAULT '',
    "canonicalBodyType" TEXT NOT NULL DEFAULT '',
    "canonicalFuelType" TEXT NOT NULL DEFAULT '',
    "canonicalTransmission" TEXT NOT NULL DEFAULT '',
    "snapshotVersion" TEXT NOT NULL DEFAULT 'v2.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "matchedLevel" INTEGER NOT NULL DEFAULT 1,
    "matchedListingCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueListingCount" INTEGER NOT NULL DEFAULT 0,
    "weightedP5" REAL NOT NULL DEFAULT 0,
    "weightedP35" REAL NOT NULL DEFAULT 0,
    "weightedP50" REAL NOT NULL DEFAULT 0,
    "weightedP60" REAL NOT NULL DEFAULT 0,
    "weightedP95" REAL NOT NULL DEFAULT 0,
    "medianMileage" REAL,
    "averageMileage" REAL,
    "mileageSampleCount" INTEGER NOT NULL DEFAULT 0,
    "mileageAdjustmentSource" TEXT,
    "iqrLowerBound" REAL NOT NULL DEFAULT 0,
    "iqrUpperBound" REAL NOT NULL DEFAULT 0,
    "kmDecayPer10k" REAL NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 90,
    "dataQualityScore" REAL NOT NULL DEFAULT 100.0,
    "snapshotDataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VehicleTransactionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleSpecificationId" TEXT,
    "licensePlate" TEXT,
    "calculatedFairMarketValue" REAL NOT NULL,
    "offeredCashPrice" REAL NOT NULL,
    "finalPurchasePrice" REAL,
    "preparationCost" REAL NOT NULL DEFAULT 0,
    "repairCost" REAL NOT NULL DEFAULT 0,
    "holdingDays" INTEGER,
    "resaleListingPrice" REAL,
    "finalResalePrice" REAL,
    "cashGrossProfit" REAL,
    "cashNetProfit" REAL,
    "consignmentListingPrice" REAL,
    "consignmentFinalSalePrice" REAL,
    "commission" REAL,
    "customerNet" REAL,
    "offerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "offerRejected" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "daysToSell" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_RolePermissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RolePermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RolePermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Model_manufacturerId_name_key" ON "Model"("manufacturerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_modelId_name_key" ON "Variant"("modelId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Package_variantId_name_key" ON "Package"("variantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FuelType_name_key" ON "FuelType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TransmissionType_name_key" ON "TransmissionType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BodyType_name_key" ON "BodyType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DriveType_name_key" ON "DriveType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentApplication_vehicleEvaluationId_key" ON "ConsignmentApplication"("vehicleEvaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "RawVehicleListing_source_sourceListingId_key" ON "RawVehicleListing"("source", "sourceListingId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleMarketSnapshot_canonicalMake_canonicalModel_canonicalVariant_canonicalTrim_year_canonicalBodyType_canonicalFuelType_canonicalTransmission_snapshotVersion_key" ON "VehicleMarketSnapshot"("canonicalMake", "canonicalModel", "canonicalVariant", "canonicalTrim", "year", "canonicalBodyType", "canonicalFuelType", "canonicalTransmission", "snapshotVersion");

-- CreateIndex
CREATE UNIQUE INDEX "_RolePermissions_AB_unique" ON "_RolePermissions"("A", "B");

-- CreateIndex
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");

