import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateCopyDto } from './dto/generate-copy.dto';
import { GenerateImagesDto } from './dto/generate-images.dto';
import { GenerateSocialPostDto } from './dto/generate-social-post.dto';
import { SaveModelConfigDto } from './dto/save-model-config.dto';
import { TestModelConfigDto } from './dto/test-model-config.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-copy')
  generateCopy(@Body() dto: GenerateCopyDto) {
    return this.aiService.generateCopy(dto);
  }

  @Post('generate-images')
  generateImages(@Body() dto: GenerateImagesDto) {
    return this.aiService.generateImages(dto);
  }

  @Post('model-configs/:type/test-connection')
  testModelConnection(
    @Param('type') type: string,
    @Body() dto: TestModelConfigDto,
  ) {
    return this.aiService.testModelConnection(type, dto);
  }

  @Get('model-configs/active')
  listActiveModelConfigs(@Req() req: { user: SessionUser }) {
    return this.aiService.listActiveModelConfigs(req.user);
  }

  @Get('model-configs/saved')
  listSavedModelConfigs(@Req() req: { user: SessionUser }) {
    return this.aiService.listSavedModelConfigs(req.user);
  }

  @Post('model-configs/:type/activate')
  activateModelConfig(
    @Req() req: { user: SessionUser },
    @Param('type') type: string,
    @Body() dto: SaveModelConfigDto,
  ) {
    return this.aiService.activateModelConfig(req.user, type, dto);
  }

  @Get('social-posts')
  listSocialPosts(@Req() req: { user: SessionUser }) {
    return this.aiService.listSocialPosts(req.user);
  }

  @Post('social-posts/generate')
  generateSocialPost(
    @Req() req: { user: SessionUser },
    @Body() dto: GenerateSocialPostDto,
  ) {
    return this.aiService.generateSocialPost(req.user, dto);
  }

  @Post('social-posts/:id/submit')
  submitSocialPost(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.submitSocialPost(req.user, id);
  }

  @Post('social-posts/:id/mark-synced')
  markSocialPostSynced(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.markSocialPostSynced(req.user, id);
  }
}
