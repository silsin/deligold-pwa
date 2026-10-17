import {
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  IsBoolean,
  IsString,
} from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string; // ISO 8601

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsString()
  brokerId?: string; // SUPER_ADMIN only
}

export class UpdateInviteDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
