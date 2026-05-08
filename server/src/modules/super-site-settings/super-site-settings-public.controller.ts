import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListSuperSiteIndustryItemsQueryDto } from './dto/list-super-site-industry-items-query.dto';
import { SuperSiteIndustryService } from './super-site-industry.service';
import { SuperSiteSettingsService } from './super-site-settings.service';

@Controller('super-site-settings/public')
export class SuperSiteSettingsPublicController {
  constructor(
    private readonly superSiteIndustryService: SuperSiteIndustryService,
    private readonly superSiteSettingsService: SuperSiteSettingsService,
  ) {}

  @Get(':userId')
  getPublicSettings(@Param('userId') userId: string) {
    return this.superSiteSettingsService.getPublicSettings(userId);
  }

  @Get(':userId/industry-items')
  listPublicIndustryItems(
    @Param('userId') userId: string,
    @Query() query: ListSuperSiteIndustryItemsQueryDto,
  ) {
    return this.superSiteIndustryService.listPublicIndustryItems(userId, query);
  }
}
