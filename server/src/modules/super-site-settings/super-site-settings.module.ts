import { Module } from '@nestjs/common';
import { AiVideoStorageService } from '../ai/ai-video-storage.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductImageStorageService } from '../products/product-image-storage.service';
import { SuperSiteIndustryCrawlerService } from './super-site-industry-crawler.service';
import { SuperSiteIndustryQueueService } from './super-site-industry-queue.service';
import { SuperSiteIndustryService } from './super-site-industry.service';
import { SuperSiteSettingsController } from './super-site-settings.controller';
import { SuperSiteSettingsPublicController } from './super-site-settings-public.controller';
import { SuperSiteSettingsService } from './super-site-settings.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [
    SuperSiteSettingsController,
    SuperSiteSettingsPublicController,
  ],
  providers: [
    SuperSiteSettingsService,
    ProductImageStorageService,
    AiVideoStorageService,
    SuperSiteIndustryService,
    SuperSiteIndustryCrawlerService,
    SuperSiteIndustryQueueService,
  ],
})
export class SuperSiteSettingsModule {}
