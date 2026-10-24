import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { SuperadminService } from './superadmin.service';
import { MarketService } from '../market/market.service';
import { TRADE_SYMBOLS } from '../market/symbols';
import { CreateSourceDto, UpdateSourceDto, ReorderDto } from './dto/superadmin.dto';

/**
 * Super-admin-only platform administration: price source management, the live
 * price-tick chart feed, and the cross-platform trade explorer.
 *
 * Every route is gated to SUPER_ADMIN — no broker scoping applies because a
 * super admin owns the whole platform.
 */
@Controller('superadmin')
@Roles(Role.SUPER_ADMIN)
export class SuperadminController {
  constructor(
    private readonly sa: SuperadminService,
    private readonly market: MarketService,
  ) {}

  // ── Price sources ────────────────────────────────────────────────────────

  /** Every price source with live health, for the admin management screen. */
  @Get('sources')
  sources() {
    return this.sa.listSources();
  }

  /** Create a new manual or trades source. */
  @Post('sources')
  create(@Body() dto: CreateSourceDto) {
    return this.sa.createSource(dto);
  }

  /** Update a source (toggle, reprioritise, configure, rename, note). */
  @Patch('sources/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.sa.updateSource(id, dto);
  }

  /** Delete a non-system source. */
  @Delete('sources/:id')
  remove(@Param('id') id: string) {
    return this.sa.deleteSource(id);
  }

  /** Reorder the source chain by setting priorities in one call. */
  @Post('sources/reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.sa.reorder(dto.items ?? []);
  }

  /** Price-tick history for the live chart, filtered by symbol/source/range. */
  @Get('ticks')
  ticks(
    @Query('symbol') symbol?: string,
    @Query('source') source?: string,
    @Query('range') range?: string,
  ) {
    return this.sa.ticks({ symbol, source, range });
  }

  /** The tradeable symbols, for the chart's symbol dropdown. */
  @Get('symbols')
  symbols() {
    return TRADE_SYMBOLS;
  }

  // ── All trades ───────────────────────────────────────────────────────────

  /** Every order across all users/brokers, filterable. */
  @Get('trades')
  trades(
    @Query('symbol') symbol?: string,
    @Query('side') side?: string,
    @Query('status') status?: string,
    @Query('brokerId') brokerId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sa.listTrades({ symbol, side, status, brokerId, userId, from, to, limit });
  }

  /** Every broker, for the trade filter dropdown. */
  @Get('brokers')
  brokers() {
    return this.sa.listBrokers();
  }
}
