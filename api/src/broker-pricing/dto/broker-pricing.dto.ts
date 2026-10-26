import { IsBoolean, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * One symbol's margin rule. Every field is optional so a manager can set just
 * a buy margin, flip a single toggle, etc. Omitted margin fields default to 0
 * (no margin) and toggles default to open.
 *
 * `targetRole` selects the price tier: "CUSTOMER" (manager→customer) or
 * "BROKER_MANAGER" (broker-admin→manager). Defaults to CUSTOMER; the service
 * rejects a manager trying to set the manager tier.
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

  @IsOptional()
  @IsIn(['CUSTOMER', 'BROKER_MANAGER'])
  targetRole?: string;
}
