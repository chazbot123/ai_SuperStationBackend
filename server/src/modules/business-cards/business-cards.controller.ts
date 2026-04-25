import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../auth/auth.types';
import { UpdateBusinessCardDto } from './dto/update-business-card.dto';
import { BusinessCardsService } from './business-cards.service';

@UseGuards(JwtAuthGuard)
@Controller('business-cards')
export class BusinessCardsController {
  constructor(private readonly businessCardsService: BusinessCardsService) {}

  @Get('me')
  getMyCard(@Req() req: { user: SessionUser }) {
    return this.businessCardsService.getMyCard(req.user.userId);
  }

  @Put('me')
  updateMyCard(
    @Req() req: { user: SessionUser },
    @Body() dto: UpdateBusinessCardDto,
  ) {
    return this.businessCardsService.updateMyCard(req.user.userId, dto);
  }
}