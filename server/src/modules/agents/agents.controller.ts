import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list(@Req() req: { user: SessionUser }, @Query() query: ListAgentsQueryDto) {
    return this.agentsService.list(req.user, query);
  }

  @Post()
  create(@Req() req: { user: SessionUser }, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(req.user, dto);
  }

  @Get(':id')
  getById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.agentsService.getById(req.user, id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(req.user, id, dto);
  }
}