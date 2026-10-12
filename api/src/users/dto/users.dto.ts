import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';

/** Body of `PATCH /users/me` — the customer's own profile editor. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'نام حداکثر ۱۲۰ کاراکتر است' })
  name?: string;

  /** National ID, checked for compliance reporting. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalId?: string;

  /** Where to ship gold when the customer chose delivery over pickup. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

/**
 * Body of `POST /users` — an operator creating an account for someone else.
 *
 * `role` is honoured only when the caller outranks it; the service enforces
 * that, not the DTO, because the rule depends on who is asking.
 */
export class CreateUserDto {
  @IsString()
  @Matches(/^\+?98?9\d{9}$|^09\d{9}$/, { message: 'شماره موبایل معتبر نیست' })
  phone!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  nationalId?: string;
}

/**
 * Body of `POST /users/:id/role` — granting or revoking a role.
 *
 * The "never mint a role at or above your own" rule is enforced in the service,
 * since it compares against the caller's role rather than a fixed constant.
 */
export class ChangeRoleDto {
  @IsEnum(Role, { message: 'نقش نامعتبر است' })
  role!: Role;

  /** Why the role changed — kept on the audit trail. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
