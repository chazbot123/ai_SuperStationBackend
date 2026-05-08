import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductUploadFile } from './product-image.types';
import { ProductImageStorageService } from './product-image-storage.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ReviewProductDto } from './dto/review-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = {
  creator: {
    select: { id: true, username: true, displayName: true, role: true },
  },
  images: {
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productImageStorageService: ProductImageStorageService,
  ) {}

  uploadImage(user: SessionUser, file?: ProductUploadFile) {
    return this.productImageStorageService.uploadProductImage(user.userId, file);
  }

  async list(user: SessionUser, query: ListProductsQueryDto) {
    const trimmedQuery = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(this.isMainCompany(user) ? {} : { creatorId: user.userId }),
      ...(trimmedQuery
        ? {
            OR: [
              { name: { contains: trimmedQuery, mode: 'insensitive' } },
              { englishName: { contains: trimmedQuery, mode: 'insensitive' } },
              { summary: { contains: trimmedQuery, mode: 'insensitive' } },
              { description: { contains: trimmedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeProduct(item)),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async create(user: SessionUser, dto: CreateProductDto) {
    this.validatePriceFields({
      specialOfferEnabled: dto.specialOfferEnabled ?? false,
      priceText: dto.priceText?.trim() || '',
      originalPriceText: dto.originalPriceText?.trim() || '',
      specialPriceText: dto.specialPriceText?.trim() || '',
    });
    const nextSortOrder = await this.getNextSortOrder();
    const created = await this.prisma.product.create({
      data: {
        creatorId: user.userId,
        name: dto.name.trim(),
        englishName: dto.englishName?.trim() || this.buildEnglishName(dto.name),
        summary: dto.summary?.trim() || '请补充商品卖点',
        priceText: dto.specialOfferEnabled ? '' : dto.priceText?.trim() || '0',
        specialOfferEnabled: dto.specialOfferEnabled ?? false,
        originalPriceText: dto.specialOfferEnabled ? dto.originalPriceText?.trim() || '' : null,
        specialPriceText: dto.specialOfferEnabled ? dto.specialPriceText?.trim() || '' : null,
        specialTag: dto.specialOfferEnabled ? dto.specialTag?.trim() || '' : null,
        description: dto.description?.trim() || null,
        status: ProductStatus.draft,
        sortOrder: nextSortOrder,
        images: {
          create: (dto.images ?? []).map((imageUrl, index) => ({
            imageUrl,
            sortOrder: index,
          })),
        },
      },
      include: productInclude,
    });

    return this.serializeProduct(created);
  }

  async getById(user: SessionUser, id: string) {
    await this.findAccessibleProduct(user, id);
    const product = await this.findProductWithRelations(id);
    return this.serializeProduct(product);
  }

  async update(user: SessionUser, id: string, dto: UpdateProductDto) {
    const existing = await this.findAccessibleProduct(user, id);
    this.ensureEditable(user, existing.status);

    const nextName = dto.name?.trim() || existing.name;
    const nextSpecialOfferEnabled =
      dto.specialOfferEnabled ?? existing.specialOfferEnabled;
    this.validatePriceFields({
      specialOfferEnabled: nextSpecialOfferEnabled,
      priceText:
        dto.priceText?.trim() ??
        existing.priceText ??
        '',
      originalPriceText:
        dto.originalPriceText?.trim() ??
        existing.originalPriceText ??
        '',
      specialPriceText:
        dto.specialPriceText?.trim() ??
        existing.specialPriceText ??
        '',
    });
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: nextName } : {}),
        ...(dto.englishName !== undefined
          ? { englishName: dto.englishName.trim() || this.buildEnglishName(nextName) }
          : { englishName: this.buildEnglishName(nextName) }),
        ...(dto.summary !== undefined
          ? { summary: dto.summary.trim() || '请补充商品卖点' }
          : {}),
        ...(dto.priceText !== undefined || dto.specialOfferEnabled !== undefined
          ? {
              priceText: nextSpecialOfferEnabled
                ? ''
                : dto.priceText?.trim() || existing.priceText || '0',
            }
          : {}),
        ...(dto.specialOfferEnabled !== undefined
          ? { specialOfferEnabled: nextSpecialOfferEnabled }
          : {}),
        ...(dto.originalPriceText !== undefined || dto.specialOfferEnabled !== undefined
          ? {
              originalPriceText: nextSpecialOfferEnabled
                ? dto.originalPriceText?.trim() ?? existing.originalPriceText ?? ''
                : null,
            }
          : {}),
        ...(dto.specialPriceText !== undefined || dto.specialOfferEnabled !== undefined
          ? {
              specialPriceText: nextSpecialOfferEnabled
                ? dto.specialPriceText?.trim() ?? existing.specialPriceText ?? ''
                : null,
            }
          : {}),
        ...(dto.specialTag !== undefined || dto.specialOfferEnabled !== undefined
          ? {
              specialTag: nextSpecialOfferEnabled
                ? dto.specialTag?.trim() ?? existing.specialTag ?? ''
                : null,
            }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.images !== undefined
          ? {
              images: {
                deleteMany: {},
                create: dto.images.map((imageUrl, index) => ({
                  imageUrl,
                  sortOrder: index,
                })),
              },
            }
          : {}),
      },
      include: productInclude,
    });

    return this.serializeProduct(updated);
  }

  async remove(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProduct(user, id);
    this.ensureRemovable(user, existing.status);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }

  async submit(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProduct(user, id);

    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司商品无需提审，可直接上架');
    }

    if (
      existing.status !== ProductStatus.draft &&
      existing.status !== ProductStatus.rejected
    ) {
      throw new ForbiddenException('当前状态不可提审');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.submitted,
        submittedAt: new Date(),
        rejectReason: null,
      },
      include: productInclude,
    });

    return this.serializeProduct(product);
  }

  async withdrawSubmission(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProduct(user, id);

    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司商品无需撤销审核');
    }

    if (existing.status !== ProductStatus.submitted) {
      throw new ForbiddenException('仅待审核商品可撤销审核');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.draft,
        submittedAt: null,
      },
      include: productInclude,
    });

    return this.serializeProduct(product);
  }

  async publish(user: SessionUser, id: string) {
    this.ensureMainCompanyUser(user);
    const existing = await this.findAccessibleProduct(user, id);

    if (
      existing.status !== ProductStatus.draft &&
      existing.status !== ProductStatus.offline
    ) {
      throw new ForbiddenException('当前状态不可上架');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.live,
        reviewedAt: new Date(),
        rejectReason: null,
      },
      include: productInclude,
    });

    return this.serializeProduct(product);
  }

  async unpublish(user: SessionUser, id: string) {
    this.ensureMainCompanyUser(user);
    const existing = await this.findAccessibleProduct(user, id);

    if (existing.status !== ProductStatus.live) {
      throw new ForbiddenException('当前状态不可下架');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.offline,
      },
      include: productInclude,
    });

    return this.serializeProduct(product);
  }

  async approve(user: SessionUser, id: string) {
    this.ensureMainCompanyUser(user);
    const existing = await this.findAccessibleProduct(user, id);

    if (existing.status !== ProductStatus.submitted) {
      throw new ForbiddenException('仅待审核商品可通过');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.live,
        reviewedAt: new Date(),
        rejectReason: null,
      },
      include: productInclude,
    });

    return this.serializeProduct(product);
  }

  async reject(user: SessionUser, id: string, dto: ReviewProductDto) {
    this.ensureMainCompanyUser(user);
    const existing = await this.findAccessibleProduct(user, id);

    if (existing.status !== ProductStatus.submitted) {
      throw new ForbiddenException('仅待审核商品可驳回');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.rejected,
        reviewedAt: new Date(),
        rejectReason: dto.reason?.trim() || '请补充商品信息后重新提交',
      },
      include: productInclude,
    });

    return this.serializeProduct(product);
  }

  inferEnglishName(name: string) {
    return { englishName: this.buildEnglishName(name) };
  }

  private async findAccessibleProduct(user: SessionUser, id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) throw new NotFoundException('商品不存在');

    if (!this.isMainCompany(user) && product.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该商品');
    }

    return product;
  }

  private findProductWithRelations(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    });
  }

  private isMainCompany(user: SessionUser) {
    return user.role === MAIN_COMPANY_ROLE_KEY;
  }

  private ensureMainCompanyUser(user: SessionUser) {
    if (!this.isMainCompany(user)) {
      throw new ForbiddenException('仅主公司可操作该商品状态');
    }
  }

  private ensureEditable(user: SessionUser, status: ProductStatus) {
    if (this.isMainCompany(user)) {
      return;
    }

    if (
      status !== ProductStatus.draft &&
      status !== ProductStatus.rejected
    ) {
      throw new ForbiddenException('仅草稿或驳回商品允许编辑');
    }
  }

  private ensureRemovable(user: SessionUser, status: ProductStatus) {
    if (this.isMainCompany(user)) {
      return;
    }

    if (
      status !== ProductStatus.draft &&
      status !== ProductStatus.rejected &&
      status !== ProductStatus.offline
    ) {
      throw new ForbiddenException('仅草稿、驳回或已下架商品允许删除');
    }
  }

  private async getNextSortOrder() {
    const result = await this.prisma.product.aggregate({
      _max: { sortOrder: true },
    });

    return (result._max.sortOrder ?? -1) + 1;
  }

  private serializeProduct(product: ProductWithRelations) {
    return {
      id: product.id,
      ownerUserId: product.creatorId,
      ownerName: product.creator.displayName,
      ownerRoleKey: product.creator.role,
      name: product.name,
      englishName: product.englishName,
      summary: product.summary,
      priceText: product.priceText,
      specialOfferEnabled: product.specialOfferEnabled,
      originalPriceText: product.originalPriceText,
      specialPriceText: product.specialPriceText,
      specialTag: product.specialTag,
      images: product.images.map((image) => image.imageUrl),
      status: product.status,
      rejectReason: product.rejectReason,
      submittedAt: product.submittedAt,
      reviewedAt: product.reviewedAt,
      description: product.description,
      sortOrder: product.sortOrder,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private validatePriceFields(
    input: {
      specialOfferEnabled: boolean;
      priceText: string;
      originalPriceText: string;
      specialPriceText: string;
    },
  ) {
    if (!input.specialOfferEnabled && !input.priceText.trim()) {
      throw new ForbiddenException('售价不能为空');
    }

    if (input.specialOfferEnabled) {
      if (!input.originalPriceText.trim()) {
        throw new ForbiddenException('启用特价后必须填写原价');
      }

      if (!input.specialPriceText.trim()) {
        throw new ForbiddenException('启用特价后必须填写特惠价');
      }
    }
  }

  private buildEnglishName(name: string) {
    const raw = name.trim();
    const normalized = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized) {
      return normalized.replace(/\s+/g, '-');
    }

    const tokens: string[] = [];
    let asciiBuffer = '';

    for (const char of Array.from(raw)) {
      const lower = char.toLowerCase();

      if (/[a-z0-9]/.test(lower)) {
        asciiBuffer += lower;
        continue;
      }

      if (asciiBuffer) {
        tokens.push(asciiBuffer);
        asciiBuffer = '';
      }

      if (/\s|[-_/]/.test(char)) {
        continue;
      }

      const codePoint = char.codePointAt(0);
      if (codePoint) {
        tokens.push(`u${codePoint.toString(16)}`);
      }
    }

    if (asciiBuffer) {
      tokens.push(asciiBuffer);
    }

    return tokens.join('-') || `product-${Date.now()}`;
  }
}
