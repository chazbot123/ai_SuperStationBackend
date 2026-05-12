import { IsArray, IsOptional, IsString } from 'class-validator';

export class SyncSuperSiteIndustryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceKeys?: string[];
}
