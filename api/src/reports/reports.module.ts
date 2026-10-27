import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsController } from './reports.controller';

@Module({
  imports: [AccountingModule, PrismaModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
