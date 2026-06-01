import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PUBLISH_JOB_STATUS_VALUES = ['running', 'success', 'failed'] as const;

export class SyncExtensionPublishJobDto {
  @IsString()
  @MaxLength(2000)
  sessionToken!: string;

  @IsString()
  @IsIn(PUBLISH_JOB_STATUS_VALUES)
  status!: (typeof PUBLISH_JOB_STATUS_VALUES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  draftUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lastError?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  authPayload?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  cookiePayload?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  runtimeSessionId?: string;
}
