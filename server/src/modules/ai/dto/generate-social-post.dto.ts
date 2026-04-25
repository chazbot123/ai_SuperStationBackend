import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TextModelConfigDto } from './generate-copy.dto';
import { ImageModelConfigDto } from './generate-images.dto';

export class GenerateSocialPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['xiaohongshu', 'douyin', 'wechat'])
  style?: 'xiaohongshu' | 'douyin' | 'wechat';

  @IsOptional()
  @IsString()
  @IsIn(['1_1', '3_4', '4_5', '9_16', '16_9'])
  sizePreset?: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';

  @IsOptional()
  @IsString()
  @IsIn(['1k', '2k', '4k'])
  resolution?: '1k' | '2k' | '4k';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  referenceImages?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TextModelConfigDto)
  textModelConfig?: TextModelConfigDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ImageModelConfigDto)
  imageModelConfig?: ImageModelConfigDto;
}
