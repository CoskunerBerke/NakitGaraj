import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const totalEvaluations = await this.prisma.vehicleEvaluation.count();
    const totalConsignments = await this.prisma.consignmentApplication.count();
    
    const pendingConsignments = await this.prisma.consignmentApplication.count({
      where: { status: 'PENDING' },
    });
    const approvedConsignments = await this.prisma.consignmentApplication.count({
      where: { status: 'APPROVED' },
    });
    const completedConsignments = await this.prisma.consignmentApplication.count({
      where: { status: 'COMPLETED' },
    });

    const evaluations = await this.prisma.vehicleEvaluation.findMany({
      select: { estimatedValue: true },
    });
    const avgValuation =
      evaluations.length > 0
        ? Math.round(
            evaluations.reduce((acc, curr) => acc + curr.estimatedValue, 0) /
              evaluations.length,
          )
        : 0;

    const recentConsignments = await this.prisma.consignmentApplication.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
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

    const recentEvaluations = await this.prisma.vehicleEvaluation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        vehicleSpecification: {
          include: {
            manufacturer: true,
            model: true,
            variant: true,
          },
        },
      },
    });

    const totalBrands = await this.prisma.manufacturer.count();
    const totalModels = await this.prisma.model.count();
    const totalSpecs = await this.prisma.vehicleSpecification.count();
    const pendingVehicleRequests = await this.prisma.vehicleRequest.count({
      where: { status: 'PENDING' },
    });

    const recentVehicleRequests = await this.prisma.vehicleRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      stats: {
        totalEvaluations,
        totalConsignments,
        pendingConsignments,
        approvedConsignments,
        completedConsignments,
        pendingVehicleRequests,
        avgValuation,
        database: {
          brands: totalBrands,
          models: totalModels,
          specifications: totalSpecs,
        },
      },
      recentConsignments,
      recentEvaluations,
      recentVehicleRequests,
    };
  }

  async getEvaluations(limit = 100, offset = 0) {
    const list = await this.prisma.vehicleEvaluation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        vehicleSpecification: {
          include: {
            manufacturer: true,
            model: true,
            variant: true,
            package: true,
            bodyType: true,
            fuelType: true,
            transmissionType: true,
          },
        },
      },
    });

    return list.map((item) => ({
      ...item,
      aiAnalysis: item.aiAnalysis ? JSON.parse(item.aiAnalysis as string) : [],
      features: item.features ? JSON.parse(item.features as string) : null,
    }));
  }

  async getVehicleRequests() {
    return this.prisma.vehicleRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateVehicleRequestStatus(id: string, status: string) {
    return this.prisma.vehicleRequest.update({
      where: { id },
      data: { status },
    });
  }

  async getUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async createUser(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleName?: string;
  }) {
    const bcrypt = require('bcrypt');
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new Error('Bu e-posta adresi ile zaten kayıtlı bir kullanıcı var.');
    }

    const targetRoleName = dto.roleName || 'STAFF';
    let role = await this.prisma.role.findUnique({
      where: { name: targetRoleName },
    });

    if (!role) {
      role = await this.prisma.role.create({
        data: { name: targetRoleName },
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: role.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    return newUser;
  }

  async deleteUser(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async updateUserPassword(id: string, newPassword: string) {
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  }
}
