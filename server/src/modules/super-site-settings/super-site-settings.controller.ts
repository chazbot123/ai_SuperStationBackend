import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../auth/auth.types';
import type { ProductUploadFile } from '../products/product-image.types';
import { CreateSuperSiteIndustryItemDto } from './dto/create-super-site-industry-item.dto';
import { ListSuperSiteIndustryItemsQueryDto } from './dto/list-super-site-industry-items-query.dto';
import { ReorderSuperSiteIndustryItemsDto } from './dto/reorder-super-site-industry-items.dto';
import { SyncSuperSiteIndustryDto } from './dto/sync-super-site-industry.dto';
import { UpdateSuperSiteSettingDto } from './dto/update-super-site-setting.dto';
import { UpdateSuperSiteIndustryItemDto } from './dto/update-super-site-industry-item.dto';
import { SuperSiteIndustryService } from './super-site-industry.service';
import { SuperSiteSettingsService } from './super-site-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('super-site-settings')
export class SuperSiteSettingsController {
  constructor(
    private readonly superSiteSettingsService: SuperSiteSettingsService,
    private readonly superSiteIndustryService: SuperSiteIndustryService,
  ) {}

  @Get('me')
  getMySettings(@Req() req: { user: SessionUser }) {
    return this.superSiteSettingsService.getMySettings(req.user.userId);
  }

  @Put('me')
  updateMySettings(
    @Req() req: { user: SessionUser },
    @Body() dto: UpdateSuperSiteSettingDto,
  ) {
    return this.superSiteSettingsService.updateMySettings(req.user.userId, dto);
  }

  @Post('me/upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadMyImage(
    @Req() req: { user: SessionUser },
    @UploadedFile() file?: ProductUploadFile,
  ) {
    return this.superSiteSettingsService.uploadSiteImage(req.user.userId, file);
  }

  @Post('me/upload-video')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  uploadMyVideo(
    @Req() req: { user: SessionUser },
    @UploadedFile() file?: ProductUploadFile,
  ) {
    return this.superSiteSettingsService.uploadSiteVideo(req.user.userId, file);
  }

  @Get('me/industry-items')
  listMyIndustryItems(
    @Req() req: { user: SessionUser },
    @Query() query: ListSuperSiteIndustryItemsQueryDto,
  ) {
    return this.superSiteIndustryService.listMyIndustryItems(req.user.userId, query);
  }

  @Post('me/industry-items')
  createMyIndustryItem(
    @Req() req: { user: SessionUser },
    @Body() dto: CreateSuperSiteIndustryItemDto,
  ) {
    return this.superSiteIndustryService.createMyIndustryItem(req.user.userId, dto);
  }

  @Patch('me/industry-items/:id')
  updateMyIndustryItem(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateSuperSiteIndustryItemDto,
  ) {
    return this.superSiteIndustryService.updateMyIndustryItem(
      req.user.userId,
      id,
      dto,
    );
  }

  @Delete('me/industry-items/:id')
  deleteMyIndustryItem(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
  ) {
    return this.superSiteIndustryService.deleteMyIndustryItem(req.user.userId, id);
  }

  @Post('me/industry-items/reorder')
  reorderMyIndustryItems(
    @Req() req: { user: SessionUser },
    @Body() dto: ReorderSuperSiteIndustryItemsDto,
  ) {
    return this.superSiteIndustryService.reorderMyIndustryItems(
      req.user.userId,
      dto,
    );
  }

  @Post('me/industry-sync')
  async syncMyIndustryItems(
    @Req() req: { user: SessionUser },
    @Body() dto: SyncSuperSiteIndustryDto,
  ) {
    return this.superSiteIndustryService.syncMyIndustryItems(req.user.userId, dto);
  }
}
