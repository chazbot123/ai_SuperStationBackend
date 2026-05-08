import { IsOptional, IsString } from 'class-validator';

export class ListStoreSearchRegionsQueryDto {
  @IsOptional()
  @IsString()
  parentAdcode?: string;
}
