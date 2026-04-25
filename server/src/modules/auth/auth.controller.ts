import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionUser } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: { user: SessionUser }) {
    return this.authService.getMe(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: { user: SessionUser }) {
    return this.authService.logout(req.user.userId, req.user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('password')
  changePassword(
    @Req() req: { user: SessionUser },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  getSessions(@Req() req: { user: SessionUser }) {
    return this.authService.listSessions(req.user.userId);
  }
}
