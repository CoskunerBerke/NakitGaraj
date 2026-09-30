import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { PERMISSIONS_KEY, ROLES_KEY } from './permissions.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const needsPermissions = !!requiredPermissions && requiredPermissions.length > 0;
    const needsRole = !!requiredRoles && requiredRoles.length > 0;

    if (!needsPermissions && !needsRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roleId) {
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmamaktadır.');
    }

    // Retrieve role permissions from the DB
    const roleWithPermissions = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      include: { permissions: true },
    });

    if (!roleWithPermissions) {
      throw new ForbiddenException('Kullanıcı rolü tanımlı değil.');
    }

    // Role name and permissions come from the DB for the token's roleId, so
    // permission changes on a role apply immediately.
    if (needsRole && !requiredRoles.includes(roleWithPermissions.name)) {
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmamaktadır.');
    }

    const userPermissions = roleWithPermissions.permissions.map((p) => p.name);
    
    // Validate if user role matches required permissions
    const hasPermission =
      !needsPermissions ||
      requiredPermissions.every((permission) => userPermissions.includes(permission));

    if (!hasPermission) {
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmamaktadır.');
    }

    return true;
  }
}
