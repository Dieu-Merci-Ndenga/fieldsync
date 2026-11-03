import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { loadConfig } from './config';

export const USER_ID_RE = /^[A-Za-z0-9_.:@+=-]{1,64}$/;

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Bearer API_TOKEN (mandatory in production) + a well-formed x-user-id. /health stays public. */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly token = loadConfig().apiToken;

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.path === '/health') return true;
    if (this.token) {
      const given = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (!safeEqual(given, this.token)) throw new UnauthorizedException('invalid or missing bearer token');
    }
    const user = req.headers['x-user-id'];
    if (req.method !== 'GET' && !(typeof user === 'string' && USER_ID_RE.test(user))) {
      throw new UnauthorizedException('x-user-id header required (1-64 chars of [A-Za-z0-9_.:@+=-])');
    }
    return true;
  }
}
