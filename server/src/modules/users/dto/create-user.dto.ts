import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  companyName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  role!: string;
}
