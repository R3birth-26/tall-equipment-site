-- CreateTable
CREATE TABLE `Equipment` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `year` INTEGER NULL,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `trim` VARCHAR(191) NULL,
    `stockNumber` VARCHAR(191) NULL,
    `serialNumber` VARCHAR(191) NULL,
    `hours` INTEGER NULL,
    `mileage` INTEGER NULL,
    `condition` VARCHAR(191) NOT NULL DEFAULT 'New',
    `color` VARCHAR(191) NULL,
    `transmission` VARCHAR(191) NULL,
    `driveType` VARCHAR(191) NULL,
    `fuelType` VARCHAR(191) NULL,
    `engine` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `cashPrice` INTEGER NOT NULL,
    `financePrice` INTEGER NULL,
    `monthlyPrice` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'available',
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Equipment_status_idx`(`status`),
    INDEX `Equipment_featured_idx`(`featured`),
    INDEX `Equipment_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Photo` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `equipmentId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Photo` ADD CONSTRAINT `Photo_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

