import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePlatformAccountDto } from './dto/create-platform-account.dto';
import { ImportGaodeStoresDto } from './dto/import-gaode-stores.dto';
import { ListStoreSearchRegionsQueryDto } from './dto/list-store-search-regions-query.dto';
import { ListPublishingContentsQueryDto } from './dto/list-publishing-contents-query.dto';
import { ListPublishingJobsQueryDto } from './dto/list-publishing-jobs-query.dto';
import { ListPlatformAccountsQueryDto } from './dto/list-platform-accounts-query.dto';
import { PublishLeadContentDto } from './dto/publish-lead-content.dto';
import { SearchGaodeStoresDto } from './dto/search-gaode-stores.dto';
import { StartMcpPlatformLoginDto } from './dto/start-mcp-platform-login.dto';
import { StartPlatformExtensionLoginDto } from './dto/start-platform-extension-login.dto';
import { StartPlatformLoginDto } from './dto/start-platform-login.dto';
import { SyncPublishingContentDto } from './dto/sync-publishing-content.dto';
import { UpdateStoreSearchConfigDto } from './dto/update-store-search-config.dto';
import { UpdatePlatformAccountDto } from './dto/update-platform-account.dto';
import { PublishingStoreSearchService } from './publishing-store-search.service';
import { PublishingService } from './publishing.service';

@UseGuards(JwtAuthGuard)
@Controller('publishing')
export class PublishingController {
  constructor(
    private readonly publishingService: PublishingService,
    private readonly publishingStoreSearchService: PublishingStoreSearchService,
  ) {}

  @Get('contents')
  listContents(
    @Req() req: { user: SessionUser },
    @Query() query: ListPublishingContentsQueryDto,
  ) {
    return this.publishingService.listContents(req.user, query);
  }

  @Get('contents/:id')
  getContentById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.getContentById(req.user, id);
  }

  @Post('contents/sync-from-source')
  syncFromSource(
    @Req() req: { user: SessionUser },
    @Body() dto: SyncPublishingContentDto,
  ) {
    return this.publishingService.syncFromSource(req.user, dto);
  }

  @Post('contents/:id/publish')
  publishContent(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: PublishLeadContentDto,
  ) {
    return this.publishingService.publishContent(req.user, id, dto);
  }

  @Get('store-search/config')
  getStoreSearchConfig(@Req() req: { user: SessionUser }) {
    return this.publishingStoreSearchService.getConfig(req.user);
  }

  @Put('store-search/config')
  updateStoreSearchConfig(
    @Req() req: { user: SessionUser },
    @Body() dto: UpdateStoreSearchConfigDto,
  ) {
    return this.publishingStoreSearchService.updateConfig(req.user, dto);
  }

  @Get('store-search/regions')
  listStoreSearchRegions(
    @Req() req: { user: SessionUser },
    @Query() query: ListStoreSearchRegionsQueryDto,
  ) {
    return this.publishingStoreSearchService.listRegions(req.user, query);
  }

  @Post('store-search/search')
  searchStores(
    @Req() req: { user: SessionUser },
    @Body() dto: SearchGaodeStoresDto,
  ) {
    return this.publishingStoreSearchService.search(req.user, dto);
  }

  @Post('store-search/import')
  importStores(
    @Req() req: { user: SessionUser },
    @Body() dto: ImportGaodeStoresDto,
  ) {
    return this.publishingStoreSearchService.importToCustomerManagement(
      req.user,
      dto,
    );
  }

  @Get('jobs')
  listJobs(
    @Req() req: { user: SessionUser },
    @Query() query: ListPublishingJobsQueryDto,
  ) {
    return this.publishingService.listJobs(req.user, query);
  }

  @Get('jobs/:id')
  getJobById(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.getJobById(req.user, id);
  }

  @Post('jobs/:id/retry')
  retryJob(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.retryJob(req.user, id);
  }

  @Post('jobs/:id/delete')
  deleteJob(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.deleteJob(req.user, id);
  }

  @Get('platform-accounts')
  listPlatformAccounts(
    @Req() req: { user: SessionUser },
    @Query() query: ListPlatformAccountsQueryDto,
  ) {
    return this.publishingService.listPlatformAccounts(req.user, query);
  }

  @Post('platform-accounts')
  createPlatformAccount(
    @Req() req: { user: SessionUser },
    @Body() dto: CreatePlatformAccountDto,
  ) {
    return this.publishingService.createPlatformAccount(req.user, dto);
  }

  @Post('platform-accounts/hosted-login/start')
  startPlatformLogin(
    @Req() req: { user: SessionUser },
    @Body() dto: StartPlatformLoginDto,
  ) {
    return this.publishingService.startPlatformLogin(req.user, dto);
  }

  @Post('platform-accounts/extension-login/start')
  startPlatformExtensionLogin(
    @Req() req: { user: SessionUser },
    @Body() dto: StartPlatformExtensionLoginDto,
  ) {
    return this.publishingService.startPlatformExtensionLogin(req.user, dto);
  }

  @Post('platform-accounts/mcp-login/start')
  startPlatformMcpLogin(
    @Req() req: { user: SessionUser },
    @Body() dto: StartMcpPlatformLoginDto,
  ) {
    return this.publishingService.startMcpPlatformLogin(req.user, dto);
  }

  @Post('platform-accounts/:id/update')
  updatePlatformAccount(
    @Req() req: { user: SessionUser },
    @Param('id') id: string,
    @Body() dto: UpdatePlatformAccountDto,
  ) {
    return this.publishingService.updatePlatformAccount(req.user, id, dto);
  }

  @Post('platform-accounts/:id/delete')
  deletePlatformAccount(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.deletePlatformAccount(req.user, id);
  }

  @Post('platform-accounts/:id/validate')
  validatePlatformAccount(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.validatePlatformAccount(req.user, id);
  }

  @Post('platform-accounts/keepalive')
  keepAlivePlatformAccounts(@Req() req: { user: SessionUser }) {
    return this.publishingService.keepAliveLoggedInPlatformAccounts(req.user);
  }

  @Post('platform-accounts/:id/hosted-login/start')
  restartPlatformLogin(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.restartPlatformLogin(req.user, id);
  }

  @Post('platform-accounts/:id/hosted-login/complete')
  completePlatformLogin(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.completePlatformLogin(req.user, id);
  }

  @Post('platform-accounts/:id/hosted-login/check')
  checkPlatformLogin(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.completePlatformLogin(req.user, id);
  }

  @Post('platform-accounts/:id/hosted-login/cancel')
  cancelPlatformLogin(@Req() req: { user: SessionUser }, @Param('id') id: string) {
    return this.publishingService.cancelPlatformLogin(req.user, id);
  }
}
