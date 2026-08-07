import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import csv from 'csv-parser';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async importJson(data: any[]) {
    return this.processImportRows(data);
  }

  async importCsv(buffer: Buffer) {
    const rows: any[] = [];
    return new Promise((resolve, reject) => {
      const stream = Readable.from(buffer);
      stream
        .pipe(csv())
        .on('data', (data: any) => rows.push(data))
        .on('end', () => {
          this.processImportRows(rows).then(resolve).catch(reject);
        })
        .on('error', (err: any) =>
          reject(new BadRequestException(`CSV Okuma Hatası: ${err.message}`)),
        );
    });
  }

  async importExcel(buffer: Buffer) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return await this.processImportRows([]);
      }
      const rows: any[] = [];
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.text;
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            rowData[header] = cell.text;
          }
        });
        rows.push(rowData);
      });

      return await this.processImportRows(rows);
    } catch (err: any) {
      throw new BadRequestException(`Excel Okuma Hatası: ${err.message}`);
    }
  }

  private async processImportRows(rows: any[]) {
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const brandName = String(
        row.brand || row.Brand || row.Manufacturer || '',
      ).trim();
      const modelName = String(row.model || row.Model || '').trim();
      const variantName = String(row.variant || row.Variant || '').trim();
      const packageName = String(row.package || row.Package || '').trim();
      const year = Number(row.year || row.Year);
      
      const bodyName = String(row.bodyType || row.BodyType || 'Sedan').trim();
      const fuelName = String(row.fuelType || row.FuelType || 'Benzin').trim();
      const transName = String(
        row.transmissionType || row.TransmissionType || 'Manuel',
      ).trim();
      const driveName = String(row.driveType || row.DriveType || 'Önden Çekiş').trim();

      if (!brandName || !modelName || !variantName || !year) {
        continue;
      }

      const mfg = await this.prisma.manufacturer.upsert({
        where: { name: brandName },
        update: {},
        create: { name: brandName },
      });

      const model = await this.prisma.model.upsert({
        where: {
          manufacturerId_name: { manufacturerId: mfg.id, name: modelName },
        },
        update: {},
        create: { name: modelName, manufacturerId: mfg.id },
      });

      const engineSize = Number(row.engineSize || row.EngineSize || 1600);
      const horsepower = Number(row.horsepower || row.Horsepower || 110);
      const torque = Number(row.torque || row.Torque || 200);

      const variant = await this.prisma.variant.upsert({
        where: { modelId_name: { modelId: model.id, name: variantName } },
        update: { engineSize, horsepower, torque },
        create: {
          name: variantName,
          modelId: model.id,
          engineSize,
          horsepower,
          torque,
        },
      });

      let pkgId: string | null = null;
      if (packageName) {
        const pkg = await this.prisma.package.upsert({
          where: { variantId_name: { variantId: variant.id, name: packageName } },
          update: {},
          create: { name: packageName, variantId: variant.id },
        });
        pkgId = pkg.id;
      }

      const body = await this.prisma.bodyType.upsert({
        where: { name: bodyName },
        update: {},
        create: { name: bodyName },
      });
      const fuel = await this.prisma.fuelType.upsert({
        where: { name: fuelName },
        update: {},
        create: { name: fuelName },
      });
      const trans = await this.prisma.transmissionType.upsert({
        where: { name: transName },
        update: {},
        create: { name: transName },
      });
      const drive = await this.prisma.driveType.upsert({
        where: { name: driveName },
        update: {},
        create: { name: driveName },
      });

      let spec = await this.prisma.vehicleSpecification.findFirst({
        where: {
          year,
          manufacturerId: mfg.id,
          modelId: model.id,
          variantId: variant.id,
          packageId: pkgId,
          bodyTypeId: body.id,
          fuelTypeId: fuel.id,
          transmissionTypeId: trans.id,
        },
      });

      const doors = Number(row.doors || row.Doors || 4);
      const seats = Number(row.seats || row.Seats || 5);
      const fuelCons = Number(row.fuelConsumption || row.FuelConsumption || 5.5);
      const emission = Number(row.emission || row.Emission || 120);

      if (!spec) {
        spec = await this.prisma.vehicleSpecification.create({
          data: {
            year,
            manufacturerId: mfg.id,
            modelId: model.id,
            variantId: variant.id,
            packageId: pkgId,
            bodyTypeId: body.id,
            fuelTypeId: fuel.id,
            transmissionTypeId: trans.id,
            driveTypeId: drive.id,
            doors,
            seats,
            fuelConsumption: fuelCons,
            emission,
          },
        });
        inserted++;
      } else {
        await this.prisma.vehicleSpecification.update({
          where: { id: spec.id },
          data: { doors, seats, fuelConsumption: fuelCons, emission },
        });
        updated++;
      }

      const marketAvg = Number(
        row.currentMarketAverage || row.CurrentMarketAverage || row.price || 500000,
      );
      const averageListing = Number(
        row.averageListingPrice || row.AverageListingPrice || marketAvg * 1.03,
      );
      const minPrice = Number(row.minPrice || row.MinPrice || marketAvg * 0.92);
      const maxPrice = Number(row.maxPrice || row.MaxPrice || marketAvg * 1.08);
      const sellingTime = Number(
        row.averageSellingTime || row.AverageSellingTime || 20,
      );

      const existingPrice = await this.prisma.vehicleMarketPrice.findFirst({
        where: { vehicleSpecificationId: spec.id },
      });

      if (existingPrice) {
        await this.prisma.vehicleMarketPrice.update({
          where: { id: existingPrice.id },
          data: {
            currentMarketAverage: marketAvg,
            averageListingPrice: averageListing,
            minPrice,
            maxPrice,
            averageSellingTime: sellingTime,
          },
        });
      } else {
        await this.prisma.vehicleMarketPrice.create({
          data: {
            vehicleSpecificationId: spec.id,
            currentMarketAverage: marketAvg,
            averageListingPrice: averageListing,
            minPrice,
            maxPrice,
            averageSellingTime: sellingTime,
            regionalPriceDifferences: JSON.stringify({
              Istanbul: 1.0,
              Ankara: 0.98,
              Izmir: 0.99,
            }),
          },
        });
      }
    }

    return {
      success: true,
      message: `Veri aktarımı tamamlandı. Yeni eklenen: ${inserted}, Güncellenen: ${updated}`,
      inserted,
      updated,
    };
  }
}
