import { IsString, MaxLength } from 'class-validator';

export class OpenPlatformAccountHomeDto {
  @IsString()
  @MaxLength(120)
  accountId!: string;
}
