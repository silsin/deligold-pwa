import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MovementDirection, Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { StoresService } from './stores.service';

/** Staff roles allowed to manage shopfronts and vaults. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

class CreateStoreDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** SUPER_ADMIN names the broker; everyone else uses their own. */
  @IsOptional()
  @IsString()
  brokerId?: string;
}

class MoveGoldDto {
  @IsString()
  symbol!: string;

  @IsEnum(MovementDirection, { message: 'جهت حرکت نامعتبر است' })
  direction!: MovementDirection;

  @IsNumber()
  @Min(0.000001, { message: 'وزن نامعتبر است' })
  grams!: number;

  /** Toman per gram, for valuing an IN movement. */
  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/**
 * The manual gold shops.
 *
 * A manager opens storefronts and records vault movements — deliveries in and
 * hand-overs out — so the physical stock is tracked per symbol, per shop. The
 * movement history is the audit trail for "where did this bar go".
 */
@Controller('stores')
@Roles(...STAFF)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  /** Every shop in the caller's broker, with its current vault contents. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.stores.list(user);
  }

  /** Opens a new storefront. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStoreDto) {
    return this.stores.create(user, dto);
  }

  /** Records gold moving into or out of a vault. */
  @Post(':id/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoveGoldDto,
  ) {
    return this.stores.move(user, id, dto);
  }

  /** Movement history for one shop, newest first. */
  @Get(':id/movements')
  movements(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stores.movements(user, id);
  }
}
