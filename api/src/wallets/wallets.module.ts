import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

/**
 * Cash movement: deposits and withdrawals, each posted to the ledger so the
 * books reconcile against wallet balances rather than drifting from them.
 */
@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
