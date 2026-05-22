import { IsString, MaxLength } from 'class-validator';

export class GetExtensionPublishAuthDto {
  @IsString()
  @MaxLength(2000)
  sessionToken!: string;
}
