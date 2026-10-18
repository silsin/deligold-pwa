import { Body, Controller, Get, Param, Patch, Post, Query, Put, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';
import { ChangeRoleDto, CreateUserDto, UpdateProfileDto } from './dto/users.dto';
import { PermissionsService, PermissionView, PermissionItem } from '../permissions/permissions.service';

/** Staff roles: everyone except a plain customer. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/**
 * User administration.
 *
 * `/users/me*` is the customer's own profile and is reachable by any signed-in
 * account. Everything under `/users` is staff-facing, and the service narrows it
 * further by broker — a manager only ever sees their own organisation.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly permissions: PermissionsService,
  ) {}

  // ── Own profile ───────────────────────────────────────────────────────────

  /** The signed-in user's profile, including their verification badge. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.userId);
  }

  /**
   * How complete the customer's profile is, and whether they carry the badge.
   *
   * The app uses this to nudge them toward the missing fields — a complete
   * profile is what a broker manager checks before verifying them, which in
   * turn unlocks instant wallet trading.
   */
  @Get('me/check')
  meCheck(@CurrentUser() user: AuthUser) {
    return this.users.profileCheck(user.userId);
  }

  /** Lets a customer edit their own name, national ID and delivery address. */
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateOwnProfile(user.userId, dto);
  }

  /**
   * Upload a national ID card image. Stored in UPLOAD_DIR/id-cards/.
   * Accepts JPEG, PNG, WEBP up to 5 MB.
   */
  @Post('me/id-card')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const dir = join(process.env.UPLOAD_DIR || './uploads', 'id-cards');
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const userId = (req as any).user?.userId ?? 'unknown';
        const ext = extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${userId}-${Date.now()}${ext}`);
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
  async uploadIdCard(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('فایلی ارسال نشده است');
    const relativePath = `id-cards/${file.filename}`;
    return this.users.saveIdCardPath(user.userId, relativePath);
  }

  // ── Staff ─────────────────────────────────────────────────────────────────

  /** Customer/staff directory, scoped to the caller's organisation. */
  @Roles(...STAFF)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('role') role?: Role,
    @Query('verified') verified?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.list(user, {
      search,
      role: role && role in Role ? role : undefined,
      verified: verified === undefined ? undefined : verified === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Creates an account on someone's behalf — a customer or a staff colleague. */
  @Roles(...STAFF)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  /**
   * Grants or revokes the verification badge.
   *
   * This is the switch that moves a customer between the two trading modes:
   * without it their buys go through the receipt queue, with it they settle
   * instantly from their wallet.
   */
  @Roles(...STAFF)
  @Post(':id/verify')
  verify(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { verified: boolean; note?: string },
  ) {
    return this.users.setVerified(user, id, {
      verified: body.verified === true,
      note: body.note,
    });
  }

  /** Changes a user's role, recording the change on the audit trail. */
  @Roles(...STAFF)
  @Post(':id/role')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.users.changeRole(user, id, dto);
  }

  /** Blocks or unblocks an account without deleting its history. */
  @Roles(...STAFF)
  @Post(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' },
  ) {
    return this.users.setStatus(user, id, body.status);
  }

  // ── Customer permissions ──────────────────────────────────────────────────

  /**
   * Get per-symbol trade permissions for a customer.
   */
  @Roles(...STAFF)
  @Get(':id/permissions')
  getPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PermissionView[]> {
    return this.permissions.listForUser(user, id);
  }

  /**
   * Set per-symbol trade permissions for a customer.
   */
  @Roles(...STAFF)
  @Put(':id/permissions')
  setPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { items: PermissionItem[] },
  ): Promise<PermissionView[]> {
    return this.permissions.setForUser(user, id, body.items);
  }
}
