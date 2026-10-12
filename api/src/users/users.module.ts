import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * User administration: profiles, the verification badge, and role grants.
 *
 * Imports AuthModule to reuse `toPublicUser`, so the shape of a user leaving
 * this module is identical to the one leaving `/auth/me` — there is only ever
 * one definition of what a "public user" is.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
