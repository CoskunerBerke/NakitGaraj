import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    action: string,
    entityName?: string,
    entityId?: string,
    userId?: string,
    ipAddress?: string,
    details?: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        action,
        entityName,
        entityId,
        userId,
        ipAddress,
        details: details ? JSON.stringify(details) : null,
      },
    });
  }

  async getLogs(limit = 100, offset = 0) {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return logs.map((log) => ({
      ...log,
      details: log.details ? JSON.parse(log.details as string) : null,
    }));
  }
}
