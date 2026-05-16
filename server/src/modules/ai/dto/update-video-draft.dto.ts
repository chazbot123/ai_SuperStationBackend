import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateVideoDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platformStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  publishTitle?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  publishTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  durationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  generatedScript?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  errorMessage?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ready', 'processing', 'failed'])
  status?: 'ready' | 'processing' | 'failed';

  @IsOptional()
  @IsBoolean()
  syncedToLeads?: boolean;

  @IsOptional()
  @IsISO8601()
  completedAt?: string;
}
