import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiModelConfigCacheService } from './ai-model-config-cache.service';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController],
  providers: [AiService, AiModelConfigCacheService],
})
export class AiModule {}
