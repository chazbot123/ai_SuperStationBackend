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
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Req() req: { user: SessionUser }, @Query() query: ListUsersQueryDto) {
    return this.usersService.list(req.user, query);
  }

  @Post()
  create(@Req() req: { user: SessionUser }, @Body() dto: CreateUserDto) {
    return this.usersService.create(req.user, dto);
  }

  @Get(':id')
  getById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.usersService.getById(req.user, id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.usersService.remove(req.user, id);
  }
}
