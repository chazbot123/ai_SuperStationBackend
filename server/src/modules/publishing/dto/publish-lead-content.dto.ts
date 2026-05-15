import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const PUBLISH_PLATFORMS = [
  'xiaohongshu',
  'douyin',
  'wechat_mp',
  'kuaishou',
  'wechat_official',
  'bilibili',
] as const;
const PUBLISH_EXECUTION_MODES = ['server', 'extension'] as const;

export class PublishLeadContentTargetDto {
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform!: (typeof PUBLISH_PLATFORMS)[number];

  @IsString()
  platformAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  draftTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  draftBody?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  draftTags?: string[];
}

export class PublishLeadContentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => PublishLeadContentTargetDto)
  targets!: PublishLeadContentTargetDto[];

  @IsOptional()
  @IsString()
  @IsIn(PUBLISH_EXECUTION_MODES)
  executionMode?: (typeof PUBLISH_EXECUTION_MODES)[number];
}
