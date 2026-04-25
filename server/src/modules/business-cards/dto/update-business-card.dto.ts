import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum BusinessCardTemplateKeyDto {
  classic_blue = 'classic_blue',
  dark_grid = 'dark_grid',
  light_modern = 'light_modern',
}

export class UpdateBusinessCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  jobTitle!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  businessScope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsEnum(BusinessCardTemplateKeyDto)
  templateKey!: BusinessCardTemplateKeyDto;
}