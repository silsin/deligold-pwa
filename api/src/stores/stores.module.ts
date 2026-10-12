import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

/**
 * The manual gold shops: storefronts, vault holdings and their movement log.
 */
@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
