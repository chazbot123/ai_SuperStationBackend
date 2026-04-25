import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessCardsController } from './business-cards.controller';
import { BusinessCardsService } from './business-cards.service';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessCardsController],
  providers: [BusinessCardsService],
})
export class BusinessCardsModule {}