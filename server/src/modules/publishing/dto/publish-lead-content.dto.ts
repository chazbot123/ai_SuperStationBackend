import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;
const PUBLISH_EXECUTION_MODES = ['server', 'extension'] as const;

export class PublishLeadContentTargetDto {
  @IsString()
  @IsIn(PUBLISH_PLATFORMS)
  platform!: (typeof PUBLISH_PLATFORMS)[number];

  @IsString()
  platformAccountId!: string;
}

export class PublishLeadContentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PublishLeadContentTargetDto)
  targets!: PublishLeadContentTargetDto[];

  @IsOptional()
  @IsString()
  @IsIn(PUBLISH_EXECUTION_MODES)
  executionMode?: (typeof PUBLISH_EXECUTION_MODES)[number];
}
