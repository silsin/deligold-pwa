import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import type { AuthUser } from './current-user.decorator';

/**
 * Validates the Bearer token the PWA sends on every request.
 *
 * The payload is deliberately thin — id, role, broker, name — so the guard can
 * authenticate a request without touching the database. Anything that must be
 * current (a suspended account, a role revoked a second ago) is re-checked by
 * the services that matter; a per-request user lookup would double the database
 * traffic for a decision almost every endpoint does not need.
 */
interface JwtPayload {
  sub: string;
  role: Role;
  brokerId: string | null;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
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

  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      role: payload.role,
      brokerId: payload.brokerId ?? null,
      name: payload.name,
    };
  }
}
