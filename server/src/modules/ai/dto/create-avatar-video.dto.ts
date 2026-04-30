import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAvatarVideoTaskDto {
  @IsString()
  @MaxLength(15000)
  fullScript!: string;

  @IsString()
  @MaxLength(20000000)
  referenceImageDataUrl!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(20000000, { each: true })
  referenceImages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  voice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  style?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  backgroundLock?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['16:9', '9:16', '1:1'])
  aspectRatio?: '16:9' | '9:16' | '1:1';

  @IsOptional()
  @IsString()
  @IsIn(['540p', '720p', '1080p'])
  resolution?: '540p' | '720p' | '1080p';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(16)
  segmentDurationSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(200)
  segmentMaxChars?: number;
}

