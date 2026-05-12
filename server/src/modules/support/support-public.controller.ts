import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateSupportSessionDto } from './dto/create-support-session.dto';
import { RequestSupportHandoffDto } from './dto/request-support-handoff.dto';
import { SendSupportMessageDto } from './dto/send-support-message.dto';
import { SupportService } from './support.service';

@Controller('support/public')
export class SupportPublicController {
  constructor(private readonly supportService: SupportService) {}

  @Post('sessions')
  createOrResumeSession(@Body() dto: CreateSupportSessionDto) {
    return this.supportService.createOrResumePublicSession(dto);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.supportService.getPublicSession(id);
  }

  @Post('sessions/:id/messages')
  sendMessage(@Param('id') id: string, @Body() dto: SendSupportMessageDto) {
    return this.supportService.sendPublicMessage(id, dto);
  }

  @Post('sessions/:id/handoff')
  requestHandoff(@Param('id') id: string, @Body() dto: RequestSupportHandoffDto) {
    return this.supportService.requestPublicHandoff(id, dto);
  }

  @Get('sessions/:id/queue')
  getQueueStatus(@Param('id') id: string) {
    return this.supportService.getPublicQueueStatus(id);
  }
}
