import { IsIn, IsString } from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;

export class StartMcpPlatformLoginDto {
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform!: (typeof PUBLISH_PLATFORMS)[number];
}
