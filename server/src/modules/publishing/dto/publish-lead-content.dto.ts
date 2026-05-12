import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';

const PUBLISH_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_mp', 'kuaishou'] as const;

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
}
