import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MODEL_PROVIDER_KEYS } from '../model-provider-presets';

export class TextModelConfigDto {
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerName?: string;

  @IsOptional()
  @IsString()
  @IsIn(MODEL_PROVIDER_KEYS)
  providerKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  modelName?: string;
}

export class GenerateCopyDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['social_post', 'product_image'])
  scene?: 'social_post' | 'product_image';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sellingPoints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  audience?: string;

  @IsOptional()
  @IsString()
  @IsIn(['xhs', 'douyin', 'wechat'])
  style?: 'xhs' | 'douyin' | 'wechat';

  @IsOptional()
  @IsString()
  @IsIn(['text', 'html'])
  format?: 'text' | 'html';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TextModelConfigDto)
  modelConfig?: TextModelConfigDto;
}

export type TextModelConfigInput = TextModelConfigDto;
