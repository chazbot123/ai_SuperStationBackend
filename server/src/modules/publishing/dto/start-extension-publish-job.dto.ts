import { IsString, MaxLength } from 'class-validator';

export class StartExtensionPublishJobDto {
  @IsString()
  @MaxLength(120)
  jobId!: string;
}
