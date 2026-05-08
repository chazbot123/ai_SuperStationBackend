import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportAdminController } from './support-admin.controller';
import { SupportAiService } from './support-ai.service';
import { SupportPublicController } from './support-public.controller';
import { SupportService } from './support.service';

@Module({
  imports: [PrismaModule, KnowledgeModule, AiModule],
  controllers: [SupportPublicController, SupportAdminController],
  providers: [SupportService, SupportAiService],
})
export class SupportModule {}
