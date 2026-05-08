import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const RBAC_PAGE_KEYS = [
  'dashboard',
  'studio',
  'publishing',
  'products',
  'assets',
  'customerManagement',
  'videos',
  'support',
  'personalization',
  'agents',
  'rules',
  'reviews',
  'rbac',
] as const;

export type RbacPageKey = (typeof RBAC_PAGE_KEYS)[number];

class IsRbacPageKeyConstraint {
  validate(value: unknown) {
    return typeof value === 'string' && RBAC_PAGE_KEYS.includes(value as RbacPageKey);
  }

  defaultMessage() {
    return 'pageKey 必须是合法的 RBAC 页面键';
  }
}

export class UpdatePermissionItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  roleKey!: string;

  @IsEnum(RBAC_PAGE_KEYS)
  pageKey!: RbacPageKey;

  @IsBoolean()
  allowed!: boolean;
}

export class UpdatePermissionMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePermissionItemDto)
  items!: UpdatePermissionItemDto[];
}
