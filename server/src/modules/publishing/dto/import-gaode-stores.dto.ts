import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ImportGaodeStoreItemDto {
  @IsOptional()
  @IsString()
  amapId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  primaryPhone?: string;

  @IsOptional()
  @IsString()
  telRaw?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

export class ImportGaodeStoresDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportGaodeStoreItemDto)
  items!: ImportGaodeStoreItemDto[];
}
