import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SuperSiteModuleDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class SuperSiteMetricDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  valueMode!: string;

  @IsString()
  startValue!: string;

  @IsString()
  tickInterval!: string;

  @IsString()
  incrementMin!: string;

  @IsString()
  incrementMax!: string;

  @IsString()
  fixedValue!: string;

  @IsString()
  suffix!: string;

  @IsString()
  highlight!: string;
}

export class SuperSiteSpecialOfferDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  summary!: string;

  @IsString()
  tag!: string;

  @IsString()
  priceText!: string;

  @IsString()
  originalPriceText!: string;

  @IsString()
  ctaText!: string;

  @IsArray()
  @IsString({ each: true })
  images!: string[];

  @IsBoolean()
  enabled!: boolean;
}

export class SuperSiteImageSlotDto {
  @IsString()
  slotKey!: string;

  @IsString()
  moduleKey!: string;

  @IsString()
  imageUrl!: string;

  @IsOptional()
  @IsString()
  sourceContentId?: string | null;

  @IsOptional()
  @IsString()
  updatedAt?: string | null;
}

export class SuperSiteIndustrySourceConfigDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsIn(['rss', 'html'])
  sourceType!: 'rss' | 'html';

  @IsBoolean()
  enabled!: boolean;
}

export class SuperSiteIndustryRefreshConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsIn(['daily'])
  frequency!: 'daily';

  @IsString()
  dailyTime!: string;
}

export class UpdateSuperSiteSettingDto {
  @IsOptional()
  @IsString()
  enterpriseName?: string;

  @IsOptional()
  @IsString()
  superSiteBaseUrl?: string;

  @IsOptional()
  @IsString()
  siteTemplate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuperSiteModuleDto)
  siteModules?: SuperSiteModuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuperSiteMetricDto)
  siteMetrics?: SuperSiteMetricDto[];

  @IsOptional()
  @IsString()
  specialOfferTitle?: string;

  @IsOptional()
  @IsString()
  specialOfferSubtitle?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuperSiteSpecialOfferDto)
  specialOffers?: SuperSiteSpecialOfferDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuperSiteImageSlotDto)
  siteImageSlots?: SuperSiteImageSlotDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuperSiteIndustrySourceConfigDto)
  industrySourceConfigs?: SuperSiteIndustrySourceConfigDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industryKeywords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SuperSiteIndustryRefreshConfigDto)
  industryRefreshConfig?: SuperSiteIndustryRefreshConfigDto;
}
