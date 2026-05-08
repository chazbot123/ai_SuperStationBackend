import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomerManagementService } from './customer-management.service';
import { CreateCustomerLeadDto } from './dto/create-customer-lead.dto';
import { ListCustomerLeadsQueryDto } from './dto/list-customer-leads-query.dto';
import { UpdateCustomerLeadDto } from './dto/update-customer-lead.dto';

@UseGuards(JwtAuthGuard)
@Controller('customer-management/leads')
export class CustomerManagementController {
  constructor(private readonly customerManagementService: CustomerManagementService) {}

  @Get()
  list(@Req() req: { user: SessionUser }, @Query() query: ListCustomerLeadsQueryDto) {
    return this.customerManagementService.list(req.user, query);
  }

  @Post()
  create(@Req() req: { user: SessionUser }, @Body() dto: CreateCustomerLeadDto) {
    return this.customerManagementService.create(req.user, dto);
  }

  @Get(':id')
  getById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.customerManagementService.getById(req.user, id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateCustomerLeadDto,
  ) {
    return this.customerManagementService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.customerManagementService.remove(req.user, id);
  }
}
