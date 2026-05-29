import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SignOptions } from 'jsonwebtoken';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { PublishingCleanupService } from './publishing-cleanup.service';
import { PublishingController } from './publishing.controller';
import { PublishingBitBrowserController } from './publishing-bitbrowser.controller';
import { PublishingExtensionController } from './publishing-extension.controller';
import { PublishingOauthController } from './publishing-oauth.controller';
import { PublishingStoreSearchService } from './publishing-store-search.service';
import { PlatformLoginBrowserService } from './platform-login-browser.service';
import { DouyinShareSchemaService } from './douyin-share-schema.service';
import { KuaishouOpenApiService } from './kuaishou-open-api.service';
import { WechatOfficialPublishService } from './wechat-official-publish.service';
import { BilibiliOpenApiService } from './bilibili-open-api.service';
import { PublishingBitBrowserService } from './publishing-bitbrowser.service';
import { PublishingService } from './publishing.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'change_me_jwt_secret',
        signOptions: {
          expiresIn:
            (configService.get<string>('JWT_EXPIRES_IN') ?? '30d') as SignOptions['expiresIn'],
        },
      }),
    }),
    PrismaModule,
    ProductsModule,
  ],
  controllers: [
    PublishingController,
    PublishingExtensionController,
    PublishingOauthController,
    PublishingBitBrowserController,
  ],
  providers: [
    PublishingService,
    PlatformLoginBrowserService,
    DouyinShareSchemaService,
    KuaishouOpenApiService,
    WechatOfficialPublishService,
    BilibiliOpenApiService,
    PublishingBitBrowserService,
    PublishingCleanupService,
    PublishingStoreSearchService,
  ],
})
export class PublishingModule {}
