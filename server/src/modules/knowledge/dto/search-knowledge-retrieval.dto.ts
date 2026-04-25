import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchKnowledgeRetrievalDto {
  @IsString()
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @IsString()
  @IsIn(['company', 'tenant', 'global'])
  scope?: 'company' | 'tenant' | 'global';

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 5))
  @IsInt()
  @Min(1)
  @Max(10)
  topK = 5;
}
