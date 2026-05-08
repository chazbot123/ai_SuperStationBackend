import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class SearchGaodeStoresDto {
  @IsString()
  regionAdcode!: string;

  @IsString()
  regionName!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  keywordsOverride?: string[];
}
