import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products/public')
export class ProductsPublicController {
  constructor(private readonly productsService: ProductsService) {}

  @Get(':userId')
  listByUser(@Param('userId') userId: string) {
    return this.productsService.listPublicByUser(userId);
  }
}
