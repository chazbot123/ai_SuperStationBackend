import {
  encodeObjectKeyForPublicUrl,
  rewriteManagedPublicObjectUrl,
  resolvePublicBucketBaseUrl,
  resolvePublicObjectUrl,
} from './public-asset-url.util';

describe('public-asset-url.util', () => {
  it('prefers FILE_BASE_URL for external object urls', () => {
    const url = resolvePublicObjectUrl(
      {
        bucketName: 'ai-superweb',
        fileBaseUrl: 'https://zlb.jizhidaoai.com/files',
        minioPublicBaseUrl: 'http://127.0.0.1:9000',
        endpoint: '127.0.0.1',
        port: 9000,
        useSSL: false,
      },
      'videos/system/task 1/final-with-subtitles.mp4',
    );

    expect(url).toBe(
      'https://zlb.jizhidaoai.com/files/ai-superweb/videos/system/task%201/final-with-subtitles.mp4',
    );
  });

  it('reuses bucket suffix when FILE_BASE_URL already includes bucket', () => {
    const baseUrl = resolvePublicBucketBaseUrl({
      bucketName: 'ai-superweb',
      fileBaseUrl: 'https://zlb.jizhidaoai.com/files/ai-superweb/',
    });

    expect(baseUrl).toBe('https://zlb.jizhidaoai.com/files/ai-superweb');
  });

  it('falls back to MINIO_PUBLIC_BASE_URL when FILE_BASE_URL is missing', () => {
    const baseUrl = resolvePublicBucketBaseUrl({
      bucketName: 'ai-superweb',
      minioPublicBaseUrl: 'https://cdn.example.com/minio',
      endpoint: '127.0.0.1',
      port: 9000,
      useSSL: false,
    });

    expect(baseUrl).toBe('https://cdn.example.com/minio/ai-superweb');
  });

  it('falls back to MINIO endpoint only when no public base url is configured', () => {
    const baseUrl = resolvePublicBucketBaseUrl({
      bucketName: 'ai-superweb',
      endpoint: 'minio.internal',
      port: 9000,
      useSSL: false,
    });

    expect(baseUrl).toBe('http://minio.internal:9000/ai-superweb');
  });

  it('encodes every object key segment', () => {
    expect(encodeObjectKeyForPublicUrl('videos/中文 folder/final clip.mp4')).toBe(
      'videos/%E4%B8%AD%E6%96%87%20folder/final%20clip.mp4',
    );
  });

  it('rewrites legacy localhost minio urls to the preferred public base url', () => {
    const url = rewriteManagedPublicObjectUrl(
      {
        bucketName: 'ai-superweb',
        fileBaseUrl: 'http://zlb.jizhidaoai.com/files',
        minioPublicBaseUrl: 'http://zlf.jizhidaoai.com/minio',
        endpoint: '127.0.0.1',
        port: 9000,
        useSSL: false,
      },
      'http://127.0.0.1:9000/ai-superweb/videos/system/task-1/final with subtitles.mp4',
    );

    expect(url).toBe(
      'http://zlb.jizhidaoai.com/files/ai-superweb/videos/system/task-1/final%20with%20subtitles.mp4',
    );
  });

  it('keeps unrelated external urls unchanged', () => {
    const url = rewriteManagedPublicObjectUrl(
      {
        bucketName: 'ai-superweb',
        fileBaseUrl: 'http://zlb.jizhidaoai.com/files',
        endpoint: '127.0.0.1',
        port: 9000,
        useSSL: false,
      },
      'https://example.com/video.mp4',
    );

    expect(url).toBe('https://example.com/video.mp4');
  });
});
