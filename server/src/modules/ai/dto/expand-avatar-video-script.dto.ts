import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TextModelConfigDto } from './generate-copy.dto';

export class ExpandAvatarVideoScriptDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(300)
  targetSeconds!: number;

  @IsOptional()
  @IsString()
  @IsIn(['douyin', 'xiaohongshu', 'wechat_mp'])
  platformStyle?: 'douyin' | 'xiaohongshu' | 'wechat_mp';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  scene?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  style?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TextModelConfigDto)
  modelConfig?: TextModelConfigDto;
}
