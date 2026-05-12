import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseSupportConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
