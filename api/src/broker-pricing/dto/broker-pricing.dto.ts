import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * One symbol's margin rule. Every field is optional so a manager can set just
 * a buy margin, flip a single toggle, etc. Omitted margin fields default to 0
 * (no margin) and toggles default to open.
 */
export class SetRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBuy?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSell?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyMarginToman?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellMarginToman?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyMarginPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellMarginPercent?: number;
}
