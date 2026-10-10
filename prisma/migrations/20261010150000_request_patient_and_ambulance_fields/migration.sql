-- AlterTable
ALTER TABLE "EmergencyRequest"
  ADD COLUMN "requestedAmbulanceType" "AmbulanceType",
  ADD COLUMN "patientName" TEXT,
  ADD COLUMN "patientAge" INTEGER,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "callbackPhone" TEXT;
