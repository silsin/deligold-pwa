import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PushModule } from '../push/push.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { parseDurationSeconds } from './auth-duration';

/**
 * Authentication: sign-up, login, token refresh and the `/me` profile.
 *
 * The JWT secret is read through a factory rather than `process.env` in the
 * decorator: decorators are evaluated when the module file is imported, which
 * is *before* ConfigModule has loaded `.env`. A direct read would therefore see
 * `undefined` and sign tokens with an empty secret.
 */
@Module({
  imports: [
    PassportModule,
    PushModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // Fail at boot, not on the first login: a missing secret would
          // otherwise sign tokens nobody can verify, or worse, an empty key.
          throw new Error('JWT_SECRET is not set — refusing to start');
        }
        return {
          secret,
          // `signOptions.expiresIn` accepts seconds as a number, so parse the
          // human form once here: '1h' -> 3600.
          signOptions: { expiresIn: parseDurationSeconds(config.get<string>('JWT_EXPIRES_IN') ?? '1h') },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // Exported so other modules (users, trading) can reuse `toPublicUser` and
  // the phone normaliser instead of re-deriving them.
  exports: [AuthService],
})
export class AuthModule {}
