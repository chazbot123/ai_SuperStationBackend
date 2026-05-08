import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerManagementController } from './customer-management.controller';
import { CustomerManagementService } from './customer-management.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerManagementController],
  providers: [CustomerManagementService],
})
export class CustomerManagementModule {}
