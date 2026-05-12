import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductImageStorageService } from './product-image-storage.service';
import { ProductsController } from './products.controller';
import { ProductsPublicController } from './products-public.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AiModule)],
  controllers: [ProductsController, ProductsPublicController],
  providers: [ProductsService, ProductImageStorageService],
  exports: [ProductsService, ProductImageStorageService],
})
export class ProductsModule {}
