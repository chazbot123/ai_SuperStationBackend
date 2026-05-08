import { SuperSiteSettingsService } from './super-site-settings.service';

describe('SuperSiteSettingsService', () => {
  it('returns default settings when the current user has no saved record', async () => {
    const service = new SuperSiteSettingsService({
      superSiteSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never);

    const result = await service.getMySettings('user-1');

    expect(result.enterpriseName).toBe('示例科技');
    expect(result.siteTemplate).toBe('standard');
    expect(result.siteMetrics).toHaveLength(4);
    expect(result.siteMetrics.find((item) => item.key === 'signing_rate')?.fixedValue).toBe('31');
  });

  it('merges defaults and saves the latest metrics payload', async () => {
    const upsert = jest.fn().mockImplementation(async ({ create, update }) => ({
      id: 'setting-1',
      userId: 'user-1',
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      ...(update ?? create),
    }));

    const service = new SuperSiteSettingsService({
      superSiteSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
    } as never);

    const result = await service.updateMySettings('user-1', {
      enterpriseName: '智邻科技',
      siteMetrics: [
        {
          key: 'visits',
          label: '访问量',
          enabled: true,
          valueMode: 'dynamic',
          startValue: '5200',
          tickInterval: '6',
          incrementMin: '2',
          incrementMax: '4',
          fixedValue: '',
          suffix: '',
          highlight: '',
        },
      ],
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      }),
    );
    expect(result.enterpriseName).toBe('智邻科技');
    expect(result.siteMetrics.find((item) => item.key === 'visits')?.startValue).toBe('5200');
    expect(result.siteMetrics).toHaveLength(4);
  });
});
