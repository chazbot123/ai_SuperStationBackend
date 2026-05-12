import { Injectable } from '@nestjs/common';
import { UpdateBusinessCardDto } from './dto/update-business-card.dto';

type BusinessCardRecord = {
  userId: string;
  companyName: string;
  jobTitle: string;
  phone: string;
  email: string;
  businessScope: string;
  coverImageUrl?: string;
  templateKey: string;
};

@Injectable()
export class BusinessCardsService {
  private readonly cards = new Map<string, BusinessCardRecord>();

  async getMyCard(userId: string) {
    const existingCard = this.cards.get(userId);
    if (existingCard) {
      return existingCard;
    }

    const defaultCard: BusinessCardRecord = {
      userId,
      companyName: '',
      jobTitle: '',
      phone: '',
      email: '',
      businessScope: '',
      templateKey: 'classic_blue',
    };
    this.cards.set(userId, defaultCard);
    return defaultCard;
  }

  async updateMyCard(userId: string, dto: UpdateBusinessCardDto) {
    const current = await this.getMyCard(userId);
    const nextCard: BusinessCardRecord = {
      ...current,
      ...dto,
      userId,
      templateKey: dto.templateKey,
      coverImageUrl: dto.coverImageUrl,
    };
    this.cards.set(userId, nextCard);
    return nextCard;
  }
}
