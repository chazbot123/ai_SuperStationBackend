import { IsArray, IsString } from 'class-validator';

export class ReorderSuperSiteIndustryItemsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
