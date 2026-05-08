import { IsString, MaxLength } from 'class-validator';

export class SendSupportMessageDto {
  @IsString()
  @MaxLength(4000)
  message!: string;
}
