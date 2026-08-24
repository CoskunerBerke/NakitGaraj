import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { resolveJwtSecret } from './jwt-secret';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Lütfen giriş yapın.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: resolveJwtSecret(),
      });
      (request as any)['user'] = payload;
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş oturum.');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
