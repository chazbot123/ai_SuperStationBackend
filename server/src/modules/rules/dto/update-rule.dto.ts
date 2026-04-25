import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minCount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  minLen?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLen?: number | null;

  @IsOptional()
  @IsBoolean()
  dedupeRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  sensitiveFilterEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  submitRateLimitPerDay?: number | null;
}