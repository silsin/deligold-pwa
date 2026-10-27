import { Body, Controller, forwardRef, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService } from './notifications.service';
import { PushService } from '../push/push.service';

class BroadcastDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsIn(['CUSTOMER', 'BROKER_MANAGER', 'BROKER_ADMIN', 'SUPER_ADMIN'])
  targetRole?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly svc: NotificationsService,
    @Inject(forwardRef(() => PushService)) private readonly push: PushService,
  ) {}

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
    // Fire push notifications to all recipients — fire-and-forget so a slow
    // or missing push subscription never delays the HTTP response.
    if (result.userIds.length) {
      void this.push.sendToUsers(result.userIds, {
        title: dto.title,
        body: dto.body,
        icon: '/icons/icon-192x192.png',
        tag: 'BROADCAST',
        data: dto.url ? { url: dto.url } : undefined,
      });
    }
    return { success: true, data: { count: result.count } };
  }
}
