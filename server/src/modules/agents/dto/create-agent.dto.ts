import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ruleId?: string;
}