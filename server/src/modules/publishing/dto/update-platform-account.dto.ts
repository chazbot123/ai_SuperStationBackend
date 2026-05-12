import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PLATFORM_ACCOUNT_AUTH_TYPES = ['cookie', 'token'] as const;
const PLATFORM_ACCOUNT_STATUSES = ['saved', 'valid', 'invalid', 'disabled'] as const;

export class UpdatePlatformAccountDto {
  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ACCOUNT_AUTH_TYPES)
  authType?: (typeof PLATFORM_ACCOUNT_AUTH_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  authPayload?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ACCOUNT_STATUSES)
  status?: (typeof PLATFORM_ACCOUNT_STATUSES)[number];
}
