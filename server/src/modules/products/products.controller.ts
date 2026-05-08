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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { InferEnglishNameDto } from './dto/infer-english-name.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ReviewProductDto } from './dto/review-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import type { ProductUploadFile } from './product-image.types';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Req() req: { user: SessionUser }, @Query() query: ListProductsQueryDto) {
    return this.productsService.list(req.user, query);
  }

  @Post()
  create(@Req() req: { user: SessionUser }, @Body() dto: CreateProductDto) {
    return this.productsService.create(req.user, dto);
  }

  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Req() req: { user: SessionUser },
    @UploadedFile() file?: ProductUploadFile,
  ) {
    return this.productsService.uploadImage(req.user, file);
  }

  @Post('infer-english-name')
  inferEnglishName(@Body() dto: InferEnglishNameDto) {
    return this.productsService.inferEnglishName(dto.name);
  }

  @Get(':id')
  getById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.getById(req.user, id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.remove(req.user, id);
  }

  @Post(':id/submit')
  submit(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.submit(req.user, id);
  }

  @Post(':id/withdraw')
  withdrawSubmission(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.withdrawSubmission(req.user, id);
  }

  @Post(':id/publish')
  publish(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.publish(req.user, id);
  }

  @Post(':id/unpublish')
  unpublish(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.unpublish(req.user, id);
  }

  @Post(':id/approve')
  approve(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.productsService.approve(req.user, id);
  }

  @Post(':id/reject')
  reject(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: ReviewProductDto,
  ) {
    return this.productsService.reject(req.user, id, dto);
  }
}
