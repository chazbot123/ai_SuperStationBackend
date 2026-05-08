import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

const PRICE_TEXT_PATTERN = /^\d+(\.\d{1,2})?$/;

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  englishName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  summary?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @MaxLength(120)
  @Matches(PRICE_TEXT_PATTERN, { message: '售价只能填写数字，最多保留两位小数' })
  priceText?: string;

  @IsOptional()
  @IsBoolean()
  specialOfferEnabled?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @MaxLength(120)
  @Matches(PRICE_TEXT_PATTERN, { message: '原价只能填写数字，最多保留两位小数' })
  originalPriceText?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @MaxLength(120)
  @Matches(PRICE_TEXT_PATTERN, { message: '特惠价只能填写数字，最多保留两位小数' })
  specialPriceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialTag?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
