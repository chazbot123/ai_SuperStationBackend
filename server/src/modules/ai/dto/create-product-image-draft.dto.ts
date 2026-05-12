import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength } from 'class-validator';

export class CreateProductImageDraftDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

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
