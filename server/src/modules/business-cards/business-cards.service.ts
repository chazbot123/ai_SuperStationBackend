import { Injectable } from '@nestjs/common';
import { BusinessCardTemplateKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessCardDto } from './dto/update-business-card.dto';

@Injectable()
export class BusinessCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyCard(userId: string) {
    const existingCard = await this.prisma.businessCard.findUnique({
      where: { userId },
    });

    if (existingCard) {
      return existingCard;
    }

    return this.prisma.businessCard.create({
      data: {
        userId,
        companyName: '',
        jobTitle: '',
        phone: '',
        email: '',
        businessScope: '',
        templateKey: BusinessCardTemplateKey.classic_blue,
      },
    });
  }

  async updateMyCard(userId: string, dto: UpdateBusinessCardDto) {
    return this.prisma.businessCard.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
        templateKey: dto.templateKey as BusinessCardTemplateKey,
      },
      update: {
        ...dto,
        templateKey: dto.templateKey as BusinessCardTemplateKey,
      },
    });
  }
}