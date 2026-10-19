import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MovementDirection, Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
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

class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortId?: number;
}

class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortId?: number;
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
 *
 * `@Public()` on `publicStores` overrides the class-level staff guard so
 * unauthenticated customers can browse a broker's shopfront and products.
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

  /** Public shopfront(s) for a broker — no auth, active stores + products.
   *  Declared before the `:id` routes so it is never shadowed by them. */
  @Public()
  @Get('public/:brokerId')
  publicStores(@Param('brokerId') brokerId: string) {
    return this.stores.getPublicStores(brokerId);
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

  /** Edit store details. */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.stores.updateStore(user, id, dto);
  }

  /** Upload a store logo. Stored in UPLOAD_DIR/store-logos/. */
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const dir = join(process.env.UPLOAD_DIR || './uploads', 'store-logos');
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const id = (req.params as any)?.id ?? 'store';
        const ext = extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${id}-${Date.now()}${ext}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new BadRequestException('فقط تصاویر JPEG، PNG یا WEBP قابل قبول هستند'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  }))
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('فایلی ارسال نشده است');
    const relativePath = `store-logos/${file.filename}`;
    return this.stores.updateLogo(user, id, relativePath);
  }

  /** All products for a store — staff/same-broker only. */
  @Get(':id/products')
  products(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stores.listProducts(user, id);
  }

  /** Create a new product in a store. */
  @Post(':id/products')
  createProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.stores.createProduct(user, id, dto);
  }

  /** Update an existing product. */
  @Patch(':id/products/:pid')
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('pid') pid: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.stores.updateProduct(user, id, pid, dto);
  }

  /** Delete a product. */
  @Delete(':id/products/:pid')
  deleteProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('pid') pid: string,
  ) {
    return this.stores.deleteProduct(user, id, pid);
  }
}
