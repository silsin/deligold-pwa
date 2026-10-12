import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ReportsController } from './reports.controller';

/**
 * Reporting endpoints (trial balance, buy/sell, …).
 *
 * The queries themselves live in `accounting/reports.service.ts`, next to the
 * ledger they read from. This module is only the HTTP surface over them, which
 * is why it imports the whole AccountingModule rather than the service alone.
 */
@Module({
  imports: [AccountingModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
