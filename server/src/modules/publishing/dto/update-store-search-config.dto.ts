import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateStoreSearchConfigDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  keywords!: string[];

  @IsOptional()
  @IsString()
  provinceAdcode?: string;

  @IsOptional()
  @IsString()
  provinceName?: string;

  @IsOptional()
  @IsString()
  cityAdcode?: string;

  @IsOptional()
  @IsString()
  cityName?: string;

  @IsOptional()
  @IsString()
  districtAdcode?: string;

  @IsOptional()
  @IsString()
  districtName?: string;

  @IsOptional()
  @IsString()
  streetAdcode?: string;

  @IsOptional()
  @IsString()
  streetName?: string;
}
