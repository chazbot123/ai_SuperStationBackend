import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;
const PLATFORM_ACCOUNT_AUTH_TYPES = ['cookie', 'token'] as const;

export class CreatePlatformAccountDto {
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform!: (typeof PUBLISH_PLATFORMS)[number];

  @IsString()
  @IsIn(PLATFORM_ACCOUNT_AUTH_TYPES)
  authType!: (typeof PLATFORM_ACCOUNT_AUTH_TYPES)[number];

  @IsString()
  @MaxLength(80)
  accountName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsString()
  @MaxLength(20000)
  authPayload!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
