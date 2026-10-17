import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { InvitesService, InviteView, InviteLookupView } from './invites.service';
import { CreateInviteDto, UpdateInviteDto } from './dto/invites.dto';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN];

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @Roles(...STAFF)
  async create(
    @CurrentUser()
    user: {
      userId: string;
      role: Role;
      brokerId: string | null;
      name: string;
    },
    @Body() dto: CreateInviteDto,
  ): Promise<InviteView> {
    return this.invites.generate(user, dto);
  }

  @Get()
  @Roles(...STAFF)
  async list(
    @CurrentUser()
    user: {
      userId: string;
      role: Role;
      brokerId: string | null;
      name: string;
    },
    @Query('brokerId') brokerId?: string,
  ): Promise<InviteView[]> {
    return this.invites.list(user, brokerId ? { brokerId } : {});
  }

  @Get(':code')
  @Public()
  async lookup(@Param('code') code: string): Promise<InviteLookupView> {
    return this.invites.lookup(code);
  }

  @Patch(':id')
  @Roles(...STAFF)
  async update(
    @CurrentUser()
    user: {
      userId: string;
      role: Role;
      brokerId: string | null;
      name: string;
    },
    @Param('id') id: string,
    @Body() dto: UpdateInviteDto,
  ): Promise<InviteView> {
    return this.invites.update(user, id, dto);
  }
}
