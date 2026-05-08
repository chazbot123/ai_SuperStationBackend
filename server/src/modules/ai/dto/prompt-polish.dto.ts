import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { TextModelConfigDto } from './generate-copy.dto';

export class PromptPolishDto {
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @IsString()
  @IsIn(['social_post', 'product_image'])
  scene!: 'social_post' | 'product_image';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TextModelConfigDto)
  modelConfig?: TextModelConfigDto;
}
