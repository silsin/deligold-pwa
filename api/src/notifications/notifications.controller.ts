import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService } from './notifications.service';

class BroadcastDto {
  title!: string;
  body!: string;
  url?: string;
  targetRole?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const data = await this.svc.list(user.userId);
    return { success: true, data };
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.svc.unreadCount(user.userId);
    return { success: true, data: { count } };
  }

  @Patch(':id/read')
  @HttpCode(200)
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.svc.markRead(user.userId, id);
    return { success: true, data: null };
  }

  @Patch('read-all')
  @HttpCode(200)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.svc.markAllRead(user.userId);
    return { success: true, data: null };
  }

  @Post('broadcast')
  @HttpCode(200)
  @Roles(Role.BROKER_ADMIN, Role.BROKER_MANAGER, Role.SUPER_ADMIN)
  async broadcast(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    const result = await this.svc.broadcast(user, dto);
    return { success: true, data: result };
  }
}
