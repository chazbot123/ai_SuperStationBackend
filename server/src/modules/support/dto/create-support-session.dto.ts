import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupportSessionDto {
  @IsString()
  @MaxLength(120)
  visitorSessionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitorContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourcePage?: string;
}
