import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsIn } from 'class-validator';
import { MODEL_PROVIDER_KEYS } from '../model-provider-presets';

export class TestModelConfigDto {
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
