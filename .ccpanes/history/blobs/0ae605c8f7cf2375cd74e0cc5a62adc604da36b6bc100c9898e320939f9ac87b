import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;

export class StartPlatformExtensionLoginDto {
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform!: (typeof PUBLISH_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalGroupId?: string;
}
