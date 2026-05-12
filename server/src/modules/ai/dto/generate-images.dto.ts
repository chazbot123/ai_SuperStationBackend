import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MODEL_PROVIDER_KEYS } from '../model-provider-presets';

export class ImageModelConfigDto {
  @IsOptional()
  @IsBoolean()
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
  taskQueryUrlTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  modelName?: string;
}

export class GenerateImagesDto {
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
  @Type(() => ImageModelConfigDto)
  modelConfig?: ImageModelConfigDto;
}

export type ImageModelConfigInput = ImageModelConfigDto;
