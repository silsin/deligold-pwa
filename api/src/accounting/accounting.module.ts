import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { LedgerService } from './ledger.service';
import { ReportsService } from './reports.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * The accounting module. Exports all three services so the trading, wallets,
 * stores and reports modules can resolve accounts, post journal entries and
 * build reports without owning ledger internals.
 */
@Module({
  imports: [PrismaModule],
  providers: [AccountsService, LedgerService, ReportsService],
  exports: [AccountsService, LedgerService, ReportsService],
})
export class AccountingModule {}
