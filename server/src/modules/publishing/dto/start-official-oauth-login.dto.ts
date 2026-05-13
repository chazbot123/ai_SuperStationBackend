import { IsIn, IsOptional, IsString } from 'class-validator';

const OFFICIAL_OAUTH_PLATFORMS = ['douyin', 'kuaishou', 'bilibili', 'wechat_official'] as const;

export class StartOfficialOauthLoginDto {
  @IsString()
  @IsIn(OFFICIAL_OAUTH_PLATFORMS)
  platform!: (typeof OFFICIAL_OAUTH_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  accountId?: string;
}
