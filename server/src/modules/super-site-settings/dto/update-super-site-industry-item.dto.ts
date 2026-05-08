import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateSuperSiteIndustryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @IsUrl({
    require_protocol: true,
  })
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @IsUrl({
    require_protocol: true,
  })
  coverImage?: string;

  @IsOptional()
  @IsString()
  publishedAt?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
