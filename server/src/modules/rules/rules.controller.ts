import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@UseGuards(JwtAuthGuard)
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  list(@Query() query: ListRulesQueryDto) {
    return this.rulesService.list(query);
  }

  @Post()
  create(@Req() req: { user: SessionUser }, @Body() dto: CreateRuleDto) {
    return this.rulesService.create(req.user, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.rulesService.getById(id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.rulesService.update(req.user, id, dto);
  }
}