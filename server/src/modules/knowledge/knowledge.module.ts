import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeParserService } from './knowledge-parser.service';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeStorageService } from './knowledge-storage.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeStorageService, KnowledgeParserService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
