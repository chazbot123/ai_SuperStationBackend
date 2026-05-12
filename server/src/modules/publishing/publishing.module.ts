import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SignOptions } from 'jsonwebtoken';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { PublishingCleanupService } from './publishing-cleanup.service';
import { PublishingController } from './publishing.controller';
import { PublishingExtensionController } from './publishing-extension.controller';
import { PublishingStoreSearchService } from './publishing-store-search.service';
import { PlatformLoginBrowserService } from './platform-login-browser.service';
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
            (configService.get<string>('JWT_EXPIRES_IN') ?? '7d') as SignOptions['expiresIn'],
        },
      }),
    }),
    PrismaModule,
    ProductsModule,
  ],
  controllers: [PublishingController, PublishingExtensionController],
  providers: [
    PublishingService,
    PlatformLoginBrowserService,
    PublishingCleanupService,
    PublishingStoreSearchService,
  ],
})
export class PublishingModule {}
