import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

/** Allowed source kinds. A super admin creates `manual` or `trades` sources;
 *  the built-in HTTP sources (akbari/tgju/estjt) are seeded and only toggled. */
export const SOURCE_KINDS = ['akbari', 'tgju', 'estjt', 'trades', 'manual'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Create a new price source. */
export class CreateSourceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  kind!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  /** Free-form params for the source (trades window, manual prices, …). */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string;
}

/** Update an existing price source. */
export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string;
}

/** Reorder sources by setting their priorities in one call. */
export class ReorderItemDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  priority!: number;
}

export class ReorderDto {
  @IsArray()
  items!: ReorderItemDto[];
}
