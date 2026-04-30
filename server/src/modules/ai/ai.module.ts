import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiModelConfigCacheService } from './ai-model-config-cache.service';
import { AiVideoConcatService } from './ai-video-concat.service';
import { AiVideoStorageService } from './ai-video-storage.service';
import { AiVideoTtsCacheService } from './ai-video-tts-cache.service';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiModelConfigCacheService,
    AiVideoStorageService,
    AiVideoConcatService,
    AiVideoTtsCacheService,
  ],
})
export class AiModule {}
