import { BadRequestException, Controller, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MarketModule } from './market/market.module';
import { WalletsModule } from './wallets/wallets.module';
import { TradingModule } from './trading/trading.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReportsModule } from './reports/reports.module';
import { StoresModule } from './stores/stores.module';
import { InvitesModule } from './invites/invites.module';
import { PermissionsModule } from './permissions/permissions.module';
import { BrokerPricingModule } from './broker-pricing/broker-pricing.module';
import { PushModule } from './push/push.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

/**
 * Generic file-upload endpoint.
 *
 * POST /uploads — accepts any image or PDF (≤ 10 MB), saves it under
 * UPLOAD_DIR/receipts/, returns { path }.
 * JWT-guarded by the global JwtAuthGuard so only signed-in users can upload.
 */
@Controller('uploads')
class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: any) => {
          const dir = join(process.env.UPLOAD_DIR || './uploads', 'receipts');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req: any, file: any, cb: any) => {
          const ext = extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
        },
      }),
      fileFilter: (_req: any, file: any, cb: any) => {
        const allowed = [
          'image/jpeg', 'image/png', 'image/webp', 'image/gif',
          'application/pdf',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('فقط تصاویر JPEG، PNG، WEBP یا PDF قابل قبول هستند'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('فایلی ارسال نشده است');
    return { path: `receipts/${file.filename}` };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MarketModule,
    WalletsModule,
    TradingModule,
    AccountingModule,
    ReportsModule,
    StoresModule,
    InvitesModule,
    PermissionsModule,
    BrokerPricingModule,
    PushModule,
    NotificationsModule,
    SuperadminModule,
  ],
  controllers: [UploadsController],
  providers: [
    // Order matters: JwtAuthGuard attaches the user, then RolesGuard reads it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
