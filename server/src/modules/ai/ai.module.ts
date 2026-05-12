import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from '../products/products.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiModelConfigCacheService } from './ai-model-config-cache.service';
import { AiVideoConcatService } from './ai-video-concat.service';
import { AiVideoStorageService } from './ai-video-storage.service';
import { AiVideoTtsCacheService } from './ai-video-tts-cache.service';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => ProductsModule)],
  controllers: [AiController],
  providers: [
    AiService,
    AiModelConfigCacheService,
    AiVideoStorageService,
    AiVideoConcatService,
    AiVideoTtsCacheService,
  ],
  exports: [AiService, AiModelConfigCacheService],
})
export class AiModule {}
