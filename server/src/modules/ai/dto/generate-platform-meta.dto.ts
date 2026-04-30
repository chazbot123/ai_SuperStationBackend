import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TextModelConfigDto } from './generate-copy.dto';

export class GeneratePlatformMetaDto {
  @IsString()
  @MaxLength(2000)
  text!: string;

  @IsOptional()
  @IsString()
  @IsIn(['product_video', 'avatar_video'])
  mode?: 'product_video' | 'avatar_video';

  @IsOptional()
  @IsString()
  @IsIn(['douyin', 'xiaohongshu', 'wechat_mp'])
  platformStyle?: 'douyin' | 'xiaohongshu' | 'wechat_mp';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TextModelConfigDto)
  modelConfig?: TextModelConfigDto;
}
