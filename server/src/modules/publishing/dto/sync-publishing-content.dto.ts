import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const SOURCE_TYPES = ['social', 'product', 'video', 'manual'] as const;
const CONTENT_TYPES = ['copy', 'image_text', 'video', 'product_asset'] as const;
const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;

export class SyncPublishingContentDto {
  @IsString()
  @IsIn(SOURCE_TYPES)
  sourceType!: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsString()
  @IsIn(CONTENT_TYPES)
  contentType!: (typeof CONTENT_TYPES)[number];

  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platformStyle!: (typeof PUBLISH_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  videoUrl?: string;
}
