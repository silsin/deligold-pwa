import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './current-user.decorator';

/**
 * Validates the Bearer token the PWA sends on every request.
 *
 * The payload carries a `tokenVersion` that must match the value stored on the
 * User row. Incrementing `tokenVersion` (e.g. on account suspension or a
 * detected compromise) instantly invalidates every outstanding token for that
 * user — no need to wait for expiry.
 *
 * We also re-check `status` here so a suspended account cannot keep trading
 * on a token that was issued before the suspension. The DB hit is a single
 * indexed primary-key lookup and only fires when the token is otherwise valid,
 * so the overhead is minimal compared to a rejected or expired token that never
 * reaches this point.
 */
interface JwtPayload {
  sub: string;
  role: Role;
  brokerId: string | null;
  name: string;
  /** Snapshot of User.tokenVersion at issue time. */
  tv: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      // Fail at boot, not on the first login: a missing secret would otherwise
      // produce tokens nobody can verify, or worse, an empty-key signature.
      throw new Error('JWT_SECRET is not set — refusing to start');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Role and broker come from the row, not the token: a manager assigned to a
    // broker (or promoted) after logging in would otherwise keep a stale scope
    // and see an empty review queue until they re-login.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, tokenVersion: true, role: true, brokerId: true },
    });

    if (!user) throw new UnauthorizedException();

    // Account suspended → reject immediately, no grace period.
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('حساب شما فعال نیست');

    // Token was issued before the last revocation event → reject.
    if (user.tokenVersion !== (payload.tv ?? 0)) throw new UnauthorizedException();

    return {
      userId: payload.sub,
      role: user.role,
      brokerId: user.brokerId ?? null,
      name: payload.name,
    };
  }
}
