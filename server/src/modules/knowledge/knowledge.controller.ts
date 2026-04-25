import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListKnowledgeDocumentsQueryDto } from './dto/list-knowledge-documents-query.dto';
import { SearchKnowledgeRetrievalDto } from './dto/search-knowledge-retrieval.dto';
import { UploadKnowledgeDocumentDto } from './dto/upload-knowledge-document.dto';
import type { KnowledgeUploadFile } from './knowledge-file.types';
import { KnowledgeService } from './knowledge.service';

@UseGuards(JwtAuthGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('documents')
  listDocuments(
    @Req() req: { user: SessionUser },
    @Query() query: ListKnowledgeDocumentsQueryDto,
  ) {
    return this.knowledgeService.listDocuments(req.user, query);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Req() req: { user: SessionUser },
    @Body() dto: UploadKnowledgeDocumentDto,
    @UploadedFile() file?: KnowledgeUploadFile,
  ) {
    return this.knowledgeService.uploadDocument(req.user, dto, file);
  }

  @Get('documents/:id')
  getDocumentById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.knowledgeService.getDocumentById(req.user, id);
  }

  @Delete('documents/:id')
  removeDocument(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.knowledgeService.removeDocument(req.user, id);
  }

  @Post('retrieval/search')
  searchRetrieval(@Req() req: { user: SessionUser }, @Body() dto: SearchKnowledgeRetrievalDto) {
    return this.knowledgeService.searchRetrieval(req.user, dto);
  }
}
