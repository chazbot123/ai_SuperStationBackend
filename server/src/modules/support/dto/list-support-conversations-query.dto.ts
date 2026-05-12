import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const SUPPORT_STATUSES = ['ai_chat', 'handoff_requested', 'queueing', 'human_chat', 'ended'] as const;

export class ListSupportConversationsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORT_STATUSES)
  status?: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyWaitingHandoff?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
