import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

/**
 * Phone numbers are the login identity for customers, matching how the rest of
 * the platform already treats them (see delly-gold). Accepted forms:
 *
 *   09121234567      local mobile
 *   +989121234567    international
 *   989121234567     international without "+"
 *
 * Stored exactly as given after trimming, so the same number typed two ways
 * still collides on the unique index rather than creating a second account.
 */
export const PHONE_RE = /^(?:\+?98|0)?9\d{9}$/;

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'شماره موبایل الزامی است' })
  @Matches(PHONE_RE, { message: 'شماره موبایل معتبر نیست' })
  phone!: string;

  @IsString()
  @MinLength(6, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  @MaxLength(72, { message: 'رمز عبور حداکثر ۷۲ کاراکتر است' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام و نام خانوادگی الزامی است' })
  @MaxLength(120)
  name!: string;

  /** Optional on sign-up — filled in later on the profile screen. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalId?: string;

  /**
   * Staff sign-ups carry a role, but a customer registering themselves in the
   * app must never be able to ask for one — see AuthController, which ignores
   * this field unless the caller already outranks it.
   */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'شماره موبایل الزامی است' })
  @Matches(PHONE_RE, { message: 'شماره موبایل معتبر نیست' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'توکن تمدید الزامی است' })
  refreshToken!: string;
}
