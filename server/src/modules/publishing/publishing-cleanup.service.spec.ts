import { ConfigService } from '@nestjs/config';
import { LeadPublishStatus } from '@prisma/client';
import { PublishingCleanupService } from './publishing-cleanup.service';

describe('PublishingCleanupService', () => {
  it('deletes only success/failed jobs older than the cutoff', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const service = new PublishingCleanupService(
      {
        leadPublishJob: {
          deleteMany,
        },
      } as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'PUBLISH_JOB_CLEANUP_ENABLED') return 'true';
          if (key === 'PUBLISH_JOB_RETENTION_DAYS') return '30';
          return undefined;
        }),
      } as unknown as ConfigService,
    );

    await service.cleanupExpiredPublishJobs();

    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [LeadPublishStatus.success, LeadPublishStatus.failed] },
          updatedAt: expect.any(Object),
        }),
      }),
    );
  });

  it('does not delete queued or running jobs even when old', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const service = new PublishingCleanupService(
      {
        leadPublishJob: {
          deleteMany,
        },
      } as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'PUBLISH_JOB_CLEANUP_ENABLED') return 'true';
          if (key === 'PUBLISH_JOB_RETENTION_DAYS') return '30';
          return undefined;
        }),
      } as unknown as ConfigService,
    );

    await service.cleanupExpiredPublishJobs();

    expect(deleteMany.mock.calls[0][0].where.status.in).not.toContain(LeadPublishStatus.queued);
    expect(deleteMany.mock.calls[0][0].where.status.in).not.toContain(LeadPublishStatus.running);
  });
});
