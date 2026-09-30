import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateConsignmentDto } from './dto/create-consignment.dto';
import { EvaluationService } from '../evaluation/evaluation.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class ConsignmentService {
  constructor(
    private prisma: PrismaService,
    private evaluationService: EvaluationService,
    private telegramService: TelegramService,
  ) {}

  async createConsignment(dto: CreateConsignmentDto) {
    let evalId = dto.vehicleEvaluationId || null;

    if (!evalId && dto.year && dto.manufacturerId && dto.modelId && dto.variantId && dto.bodyTypeId && dto.fuelTypeId && dto.transmissionTypeId) {
      const evResult = await this.evaluationService.evaluateVehicle({
        year: dto.year,
        manufacturerId: dto.manufacturerId,
        modelId: dto.modelId,
        variantId: dto.variantId,
        packageId: dto.packageId || '',
        bodyTypeId: dto.bodyTypeId,
        fuelTypeId: dto.fuelTypeId,
        transmissionTypeId: dto.transmissionTypeId,
        mileage: dto.mileage || 100000,
        color: dto.color || 'Beyaz',
        damageStatus: 'UNKNOWN',
        licensePlate: '34ABC123', // placeholder
        paintScheme: dto.paintScheme,
        chassisState: dto.chassisState,
        equipments: dto.equipments,
        vehicleStatus: dto.vehicleStatus,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        sellingTimeline: 'hemen',
        userDesiredPrice: 0,
      });
      evalId = evResult.evaluationId || null;
    }

    let consignment;
    try {
      consignment = await this.prisma.consignmentApplication.create({
        data: {
          vehicleEvaluationId: evalId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          province: dto.province,
          district: dto.district,
          preferredContact: dto.preferredContact,
          status: 'PENDING',
          notes: dto.notes || null,
        },
        include: {
          vehicleEvaluation: {
            include: {
              vehicleSpecification: {
                include: {
                  manufacturer: true,
                  model: true,
                },
              },
            },
          },
        },
      });
    } catch (err) {
      // vehicleEvaluationId is unique: one application per valuation.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Bu değerleme için zaten bir konsinye başvurusu alınmış.');
      }
      throw err;
    }

    const vSpec = consignment.vehicleEvaluation?.vehicleSpecification;
    const vehicleName = vSpec
      ? `${vSpec.year} ${vSpec.manufacturer.name} ${vSpec.model.name}`
      : 'Belirtilmedi';

    this.telegramService.sendConsignmentNotification({
      firstName: consignment.firstName,
      lastName: consignment.lastName,
      phone: consignment.phone,
      province: consignment.province,
      district: consignment.district,
      vehicleName,
      mileage: consignment.vehicleEvaluation?.mileage,
      licensePlate: consignment.vehicleEvaluation?.licensePlate,
      desiredPrice: consignment.vehicleEvaluation?.userDesiredPrice || undefined,
      notes: consignment.notes || undefined,
    }).catch((err) => console.error('Telegram Consignment Notify Error:', err.message));

    // This is a public endpoint and vehicleEvaluationId comes from the caller:
    // never echo the linked evaluation (another customer's name, phone, IP,
    // plate) back. The applicant only gets their own application data.
    const { vehicleEvaluation: _linkedEvaluation, ...applicantConsignment } = consignment;

    return {
      success: true,
      message: 'Konsinye başvurunuz başarıyla alınmıştır. Uzmanlarımız sizinle en kısa sürede iletişime geçecektir.',
      consignmentId: consignment.id,
      consignment: applicantConsignment,
    };
  }

  async getConsignments(limit = 100, offset = 0) {
    return this.prisma.consignmentApplication.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        vehicleEvaluation: {
          include: {
            vehicleSpecification: {
              include: {
                manufacturer: true,
                model: true,
                variant: true,
                package: true,
              },
            },
          },
        },
      },
    });
  }

  async updateStatus(id: string, status: string, notes?: string) {
    return this.prisma.consignmentApplication.update({
      where: { id },
      data: { status, notes, updatedAt: new Date() },
    });
  }
}
