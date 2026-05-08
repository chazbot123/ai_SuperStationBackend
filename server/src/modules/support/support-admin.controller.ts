import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CloseSupportConversationDto } from './dto/close-support-conversation.dto';
import { ListSupportConversationsQueryDto } from './dto/list-support-conversations-query.dto';
import { ReplySupportConversationDto } from './dto/reply-support-conversation.dto';
import { TakeSupportConversationDto } from './dto/take-support-conversation.dto';
import { SupportService } from './support.service';

@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportAdminController {
  constructor(private readonly supportService: SupportService) {}

  @Get('conversations')
  listConversations(
    @Req() req: { user: SessionUser },
    @Query() query: ListSupportConversationsQueryDto,
  ) {
    return this.supportService.listAdminConversations(req.user, query);
  }

  @Get('conversations/:id')
  getConversation(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.supportService.getAdminConversation(req.user, id);
  }

  @Post('conversations/:id/take')
  takeConversation(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: TakeSupportConversationDto,
  ) {
    return this.supportService.takeAdminConversation(req.user, id, dto);
  }

  @Post('conversations/:id/reply')
  replyConversation(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: ReplySupportConversationDto,
  ) {
    return this.supportService.replyAdminConversation(req.user, id, dto);
  }

  @Post('conversations/:id/close')
  closeConversation(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: CloseSupportConversationDto,
  ) {
    return this.supportService.closeAdminConversation(req.user, id, dto);
  }
}
