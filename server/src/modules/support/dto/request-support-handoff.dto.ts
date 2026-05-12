import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestSupportHandoffDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
