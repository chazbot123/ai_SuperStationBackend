import { IsString, MaxLength } from 'class-validator';

export class ReplySupportConversationDto {
  @IsString()
  @MaxLength(4000)
  message!: string;
}
