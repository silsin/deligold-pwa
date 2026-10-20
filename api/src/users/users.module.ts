import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PushModule } from '../push/push.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * User administration: profiles, the verification badge, and role grants.
 *
 * Imports AuthModule to reuse `toPublicUser`, so the shape of a user leaving
 * this module is identical to the one leaving `/auth/me` — there is only ever
 * one definition of what a "public user" is.
 *
 * Imports PermissionsModule for customer trade permission management.
 */
@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, PushModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
