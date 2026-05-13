import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou', 'bilibili', 'wechat_official'] as const;
const PLATFORM_ACCOUNT_STATUSES = ['saved', 'valid', 'invalid', 'disabled'] as const;
const PLATFORM_ACCOUNT_LOGIN_STATUSES = [
  'idle',
  'pending',
  'authenticated',
  'failed',
  'cancelled',
] as const;
const PLATFORM_ACCOUNT_PROVIDERS = ['extension', 'mcp', 'official_oauth'] as const;
const PLATFORM_ACCOUNT_AUTO_COMPLETE = ['none', 'pending'] as const;

export class ListPlatformAccountsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform?: (typeof PUBLISH_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ACCOUNT_STATUSES)
  status?: (typeof PLATFORM_ACCOUNT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ACCOUNT_LOGIN_STATUSES)
  loginStatus?: (typeof PLATFORM_ACCOUNT_LOGIN_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ACCOUNT_PROVIDERS)
  provider?: (typeof PLATFORM_ACCOUNT_PROVIDERS)[number];

  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ACCOUNT_AUTO_COMPLETE)
  autoComplete?: (typeof PLATFORM_ACCOUNT_AUTO_COMPLETE)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
