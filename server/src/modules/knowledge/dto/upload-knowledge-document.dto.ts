import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadKnowledgeDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(['company', 'tenant', 'global'])
  scope?: 'company' | 'tenant' | 'global';
}
