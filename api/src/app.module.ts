import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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
import { UploadsModule } from './uploads/uploads.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

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
    UploadsModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard attaches the user, then RolesGuard reads it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
