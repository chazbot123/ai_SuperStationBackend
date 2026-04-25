import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../auth/auth.types';
import { RbacService } from './rbac.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/update-role.dto';
import { UpdatePermissionMatrixDto } from './dto/update-permission-matrix.dto';

@UseGuards(JwtAuthGuard)
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  getRbac() {
    return this.rbacService.getRbac();
  }

  @Post('roles')
  createRole(
    @Req() req: { user: SessionUser },
    @Body() dto: CreateRoleDto,
  ) {
    return this.rbacService.createRole(req.user, dto);
  }

  @Patch('roles/:key')
  updateRole(
    @Req() req: { user: SessionUser },
    @Param('key') key: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rbacService.updateRole(req.user, key, dto);
  }

  @Delete('roles/:key')
  removeRole(@Req() req: { user: SessionUser }, @Param('key') key: string) {
    return this.rbacService.removeRole(req.user, key);
  }

  @Patch('permissions')
  updatePermissions(
    @Req() req: { user: SessionUser },
    @Body() dto: UpdatePermissionMatrixDto,
  ) {
    return this.rbacService.updatePermission(req.user, dto);
  }
}
