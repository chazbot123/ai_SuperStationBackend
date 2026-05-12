import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProductImageDraftDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(20000, { each: true })
  images?: string[];
}
