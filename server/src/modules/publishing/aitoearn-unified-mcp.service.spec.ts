import { ConfigService } from '@nestjs/config';
import { AitoearnUnifiedMcpService } from './aitoearn-unified-mcp.service';

describe('AitoearnUnifiedMcpService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('publishes douyin draft via jsonrpc tools', async () => {
    const configService = {
      get: (key: string) => {
        if (key === 'AITOEARN_MCP_BASE_URL') return 'https://aitoearn.cn';
        if (key === 'AITOEARN_MCP_API_KEY') return 'test_key';
        return undefined;
      },
    } as unknown as ConfigService;

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            result: { tools: [{ name: 'douyin_publish', description: 'douyin publish' }] },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jsonrpc: '2.0',
            id: '2',
            result: { draftUrl: 'https://example.com/draft/1', draftId: 'd1', flowId: 'f1' },
          }),
      }) as unknown as typeof fetch;

    const service = new AitoearnUnifiedMcpService(configService);
    const result = await service.publishDouyinDraft({
      accountId: 'acc1',
      title: 't',
      body: 'b',
      tags: [],
      images: [],
      videoUrl: null,
    });

    expect(global.fetch).toHaveBeenCalled();
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://aitoearn.cn/api/unified/mcp');
    expect(result.draftUrl).toBe('https://example.com/draft/1');
    expect(result.externalDraftId).toBe('d1');
    expect(result.externalFlowId).toBe('f1');
  });
});

