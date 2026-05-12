import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;
const PUBLISH_STATUSES = ['queued', 'running', 'success', 'failed'] as const;

export class ListPublishingJobsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform?: (typeof PUBLISH_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @IsIn(PUBLISH_STATUSES)
  status?: (typeof PUBLISH_STATUSES)[number];

  @IsOptional()
  @IsString()
  contentId?: string;

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
