import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const PLATFORM_ACCOUNT_AUTH_TYPES = ['cookie', 'token'] as const;

export class SyncPlatformExtensionLoginDto {
  @IsString()
  @MaxLength(2000)
  sessionToken!: string;

  @IsString()
  @IsIn(PLATFORM_ACCOUNT_AUTH_TYPES)
  authType!: (typeof PLATFORM_ACCOUNT_AUTH_TYPES)[number];

  @IsString()
  @MaxLength(20000)
  authPayload!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  avatarUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  followerCount?: number;
}
