import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const CONTENT_STATUSES = ['active', 'archived', 'deleted'] as const;
const CONTENT_TYPES = ['copy', 'image_text', 'video', 'product_asset'] as const;
const SOURCE_TYPES = ['social', 'product', 'video', 'manual'] as const;
const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;

export class ListPublishingContentsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(CONTENT_STATUSES)
  status?: (typeof CONTENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn(CONTENT_TYPES)
  contentType?: (typeof CONTENT_TYPES)[number];

  @IsOptional()
  @IsString()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platformStyle?: (typeof PUBLISH_PLATFORMS)[number];

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
