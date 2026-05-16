import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProductImageDraftDto {
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(20000, { each: true })
  images!: string[];

  @IsString()
  @IsIn(['1_1', '3_4', '4_5', '9_16', '16_9'])
  sizePreset!: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';

  @IsString()
  @IsIn(['1k', '2k', '4k'])
  resolution!: '1k' | '2k' | '4k';
}
