import { CustomerSourcePlatform } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCustomerLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  wechatId?: string;

  @IsOptional()
  @IsString()
  platformName?: string;

  @IsEnum(CustomerSourcePlatform)
  sourcePlatform!: CustomerSourcePlatform;
}
