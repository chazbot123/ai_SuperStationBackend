import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { PublishingCleanupService } from './publishing-cleanup.service';
import { PublishingController } from './publishing.controller';
import { PublishingStoreSearchService } from './publishing-store-search.service';
import { PlatformLoginBrowserService } from './platform-login-browser.service';
import { PublishingService } from './publishing.service';

@Module({
  imports: [ConfigModule, PrismaModule, ProductsModule],
  controllers: [PublishingController],
  providers: [
    PublishingService,
    PlatformLoginBrowserService,
    PublishingCleanupService,
    PublishingStoreSearchService,
  ],
})
export class PublishingModule {}
