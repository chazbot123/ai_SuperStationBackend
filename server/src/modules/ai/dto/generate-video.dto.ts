import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MODEL_PROVIDER_KEYS } from '../model-provider-presets';

export class VideoModelConfigDto {
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

export class GenerateVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ttsText?: string;

  @IsOptional()
  @IsBoolean()
  subtitleEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(20000000, { each: true })
  referenceImages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(20000000, { each: true })
  referenceVideos?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsIn(['auto', 'start_frame', 'start_end', 'image_reference'])
  referenceMode?: 'auto' | 'start_frame' | 'start_end' | 'image_reference';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsIn(['auto', 'keep_original'])
  audioMode?: 'auto' | 'keep_original';

  @IsOptional()
  @IsString()
  @MaxLength(20000000)
  audioUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  size?: string;

  @IsOptional()
  @IsBoolean()
  generateAudio?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'bgmUrl 必须为合法 URL' })
  @MaxLength(500)
  bgmUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  bgmVolume?: number;

  @IsOptional()
  @IsString()
  @IsIn(['auto', 'low', 'medium', 'high'])
  movementAmplitude?: 'auto' | 'low' | 'medium' | 'high';

  @IsOptional()
  @IsString()
  @IsIn(['16:9', '9:16', '1:1'])
  aspectRatio?: '16:9' | '9:16' | '1:1';

  @IsOptional()
  @IsString()
  @IsIn(['360p', '540p', '720p', '1080p'])
  resolution?: '360p' | '540p' | '720p' | '1080p';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(60)
  durationSeconds?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => VideoModelConfigDto)
  modelConfig?: VideoModelConfigDto;
}

export type VideoModelConfigInput = VideoModelConfigDto;
