import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { CreateProductImageDraftDto } from './dto/create-product-image-draft.dto';
import { CreateVideoDraftDto } from './dto/create-video-draft.dto';
import { CreateAvatarVideoTaskDto } from './dto/create-avatar-video.dto';
import { GenerateCopyDto } from './dto/generate-copy.dto';
import { GenerateImagesDto } from './dto/generate-images.dto';
import { GeneratePlatformMetaDto } from './dto/generate-platform-meta.dto';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { GenerateSocialPostDto } from './dto/generate-social-post.dto';
import { PromptPolishDto } from './dto/prompt-polish.dto';
import { ExpandAvatarVideoScriptDto } from './dto/expand-avatar-video-script.dto';
import { PolishPromptDto } from './dto/polish-prompt.dto';
import { RecommendBgmDto } from './dto/recommend-bgm.dto';
import { ReviewMaterialDecisionDto } from './dto/review-material-decision.dto';
import { SaveModelConfigDto } from './dto/save-model-config.dto';
import { TestModelConfigDto } from './dto/test-model-config.dto';
import { UpdateProductImageDraftDto } from './dto/update-product-image-draft.dto';
import { UpdateSocialPostDto } from './dto/update-social-post.dto';
import { UpdateVideoDraftDto } from './dto/update-video-draft.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-copy')
  generateCopy(@Req() req: { user: SessionUser }, @Body() dto: GenerateCopyDto) {
    return this.aiService.generateCopy(req.user, dto);
  }

  @Post('polish-prompt')
  polishPrompt(@Req() req: { user: SessionUser }, @Body() dto: PolishPromptDto) {
    return this.aiService.polishPrompt(req.user, dto);
  }

  @Post('generate-platform-meta')
  generatePlatformMeta(@Req() req: { user: SessionUser }, @Body() dto: GeneratePlatformMetaDto) {
    return this.aiService.generatePlatformMeta(req.user, dto);
  }

  @Post('generate-images')
  generateImages(@Req() req: { user: SessionUser }, @Body() dto: GenerateImagesDto) {
    return this.aiService.generateImages(req.user, dto);
  }

  @Post('prompt-polish')
  promptPolish(@Req() req: { user: SessionUser }, @Body() dto: PromptPolishDto) {
    return this.aiService.promptPolish(req.user, dto);
  }

  @Post('generate-video')
  generateVideo(@Req() req: { user: SessionUser }, @Body() dto: GenerateVideoDto) {
    return this.aiService.generateVideo(req.user, dto);
  }

  @Post('recommend-bgm')
  recommendBgm(@Req() req: { user: SessionUser }, @Body() dto: RecommendBgmDto) {
    return this.aiService.recommendBgm(req.user, dto);
  }

  @Get('video-tasks/:taskId')
  getVideoTask(@Req() req: { user: SessionUser }, @Param('taskId') taskId: string) {
    return this.aiService.getVideoTask(req.user, taskId);
  }

  @Post('avatar-video-tasks')
  createAvatarVideoTask(
    @Req() req: { user: SessionUser },
    @Body() dto: CreateAvatarVideoTaskDto,
  ) {
    return this.aiService.createAvatarVideoTask(req.user, dto);
  }

  @Post('avatar-video-scripts/expand')
  expandAvatarVideoScript(@Req() req: { user: SessionUser }, @Body() dto: ExpandAvatarVideoScriptDto) {
    return this.aiService.expandAvatarVideoScript(req.user, dto);
  }

  @Get('avatar-video-tasks/:id')
  getAvatarVideoTask(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.getAvatarVideoTask(req.user, id);
  }

  @Post('avatar-video-tasks/:id/retry')
  retryAvatarVideoTask(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.retryAvatarVideoTask(req.user, id);
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

  @Get('product-image-drafts')
  listProductImageDrafts(@Req() req: { user: SessionUser }) {
    return this.aiService.listProductImageDrafts(req.user);
  }

  @Get('video-drafts')
  listVideoDrafts(@Req() req: { user: SessionUser }) {
    return this.aiService.listVideoDrafts(req.user);
  }

  @Get('review-materials')
  listReviewMaterials(@Req() req: { user: SessionUser }) {
    return this.aiService.listReviewMaterials(req.user);
  }

  @Post('review-materials/:source/:id/approve')
  approveReviewMaterial(
    @Req() req: { user: SessionUser },
    @Param('source') source: string,
    @Param('id') id: string,
  ) {
    return this.aiService.approveReviewMaterial(req.user, source, id);
  }

  @Post('review-materials/:source/:id/reject')
  rejectReviewMaterial(
    @Req() req: { user: SessionUser },
    @Param('source') source: string,
    @Param('id') id: string,
    @Body() dto: ReviewMaterialDecisionDto,
  ) {
    return this.aiService.rejectReviewMaterial(req.user, source, id, dto);
  }

  @Post('social-posts/generate')
  generateSocialPost(
    @Req() req: { user: SessionUser },
    @Body() dto: GenerateSocialPostDto,
  ) {
    return this.aiService.generateSocialPost(req.user, dto);
  }

  @Post('product-image-drafts')
  createProductImageDraft(
    @Req() req: { user: SessionUser },
    @Body() dto: CreateProductImageDraftDto,
  ) {
    return this.aiService.createProductImageDraft(req.user, dto);
  }

  @Post('video-drafts')
  createVideoDraft(
    @Req() req: { user: SessionUser },
    @Body() dto: CreateVideoDraftDto,
  ) {
    return this.aiService.createVideoDraft(req.user, dto);
  }

  @Post('social-posts/:id/submit')
  submitSocialPost(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.submitSocialPost(req.user, id);
  }

  @Post('social-posts/:id/withdraw')
  withdrawSocialPostReview(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.withdrawSocialPostReview(req.user, id);
  }

  @Post('social-posts/:id/mark-synced')
  markSocialPostSynced(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.markSocialPostSynced(req.user, id);
  }

  @Patch('social-posts/:id')
  updateSocialPost(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateSocialPostDto,
  ) {
    return this.aiService.updateSocialPost(req.user, id, dto);
  }

  @Delete('social-posts/:id')
  removeSocialPost(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.removeSocialPost(req.user, id);
  }

  @Patch('product-image-drafts/:id')
  updateProductImageDraft(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateProductImageDraftDto,
  ) {
    return this.aiService.updateProductImageDraft(req.user, id, dto);
  }

  @Patch('video-drafts/:id')
  updateVideoDraft(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdateVideoDraftDto,
  ) {
    return this.aiService.updateVideoDraft(req.user, id, dto);
  }

  @Delete('product-image-drafts/:id')
  removeProductImageDraft(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.removeProductImageDraft(req.user, id);
  }

  @Post('product-image-drafts/:id/submit')
  submitProductImageDraft(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.submitProductImageDraft(req.user, id);
  }

  @Post('product-image-drafts/:id/withdraw')
  withdrawProductImageDraftReview(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.withdrawProductImageDraftReview(req.user, id);
  }

  @Post('product-image-drafts/:id/mark-synced')
  markProductImageDraftSynced(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.markProductImageDraftSynced(req.user, id);
  }

  @Post('product-image-drafts/:id/mark-product-synced')
  markProductImageDraftProductSynced(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.markProductImageDraftProductSynced(req.user, id);
  }

  @Post('video-drafts/:id/submit')
  submitVideoDraft(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.submitVideoDraft(req.user, id);
  }

  @Post('video-drafts/:id/withdraw')
  withdrawVideoDraftReview(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.withdrawVideoDraftReview(req.user, id);
  }

  @Post('video-drafts/:id/mark-synced')
  markVideoDraftSynced(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.aiService.markVideoDraftSynced(req.user, id);
  }
}
