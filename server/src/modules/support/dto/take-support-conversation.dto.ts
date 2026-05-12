import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TakeSupportConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
