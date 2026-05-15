type PublicAssetUrlConfig = {
  bucketName: string;
  fileBaseUrl?: string | null;
  minioPublicBaseUrl?: string | null;
  endpoint?: string | null;
  port?: number;
  useSSL?: boolean;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function appendBucketIfMissing(baseUrl: string, bucketName: string) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const bucketSuffix = `/${bucketName}`;
  return normalizedBaseUrl.endsWith(bucketSuffix) ? normalizedBaseUrl : `${normalizedBaseUrl}${bucketSuffix}`;
}

function buildEndpointOrigin(config: PublicAssetUrlConfig) {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) {
    return null;
  }

  const protocol = config.useSSL ? 'https' : 'http';
  const port = config.port ?? (config.useSSL ? 443 : 80);
  const isDefaultPort = (!config.useSSL && port === 80) || (config.useSSL && port === 443);
  return `${protocol}://${endpoint}${isDefaultPort ? '' : `:${port}`}`;
}

function buildKnownBucketBaseUrls(config: PublicAssetUrlConfig) {
  const values = [
    config.fileBaseUrl?.trim(),
    config.minioPublicBaseUrl?.trim(),
    buildEndpointOrigin(config),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values.map((value) => appendBucketIfMissing(value, config.bucketName))));
}

export function encodeObjectKeyForPublicUrl(objectKey: string) {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function resolvePublicBucketBaseUrl(config: PublicAssetUrlConfig) {
  const explicitFileBaseUrl = config.fileBaseUrl?.trim();
  if (explicitFileBaseUrl) {
    return appendBucketIfMissing(explicitFileBaseUrl, config.bucketName);
  }

  const explicitMinioPublicBaseUrl = config.minioPublicBaseUrl?.trim();
  if (explicitMinioPublicBaseUrl) {
    return appendBucketIfMissing(explicitMinioPublicBaseUrl, config.bucketName);
  }

  const endpointOrigin = buildEndpointOrigin(config);
  if (!endpointOrigin) {
    return null;
  }
  return appendBucketIfMissing(endpointOrigin, config.bucketName);
}

export function resolvePublicObjectUrl(config: PublicAssetUrlConfig, objectKey: string) {
  const publicBucketBaseUrl = resolvePublicBucketBaseUrl(config);
  if (!publicBucketBaseUrl) {
    return null;
  }

  return `${publicBucketBaseUrl}/${encodeObjectKeyForPublicUrl(objectKey)}`;
}

export function rewriteManagedPublicObjectUrl(config: PublicAssetUrlConfig, inputUrl?: string | null) {
  const trimmedUrl = inputUrl?.trim();
  if (!trimmedUrl) {
    return inputUrl ?? null;
  }

  const targetPublicBucketBaseUrl = resolvePublicBucketBaseUrl(config);
  if (!targetPublicBucketBaseUrl) {
    return trimmedUrl;
  }

  const knownBucketBaseUrls = buildKnownBucketBaseUrls(config);
  const matchedBaseUrl = knownBucketBaseUrls.find((baseUrl) => trimmedUrl.startsWith(`${baseUrl}/`));
  if (matchedBaseUrl) {
    const objectKey = decodeURIComponent(trimmedUrl.slice(matchedBaseUrl.length + 1));
    return resolvePublicObjectUrl(config, objectKey) ?? trimmedUrl;
  }

  try {
    const parsed = new URL(trimmedUrl);
    const pathSegments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const bucketIndex = pathSegments.indexOf(config.bucketName);
    if (bucketIndex < 0 || bucketIndex === pathSegments.length - 1) {
      return trimmedUrl;
    }

    const isLocalLikeHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname === '::1';
    if (!isLocalLikeHost) {
      return trimmedUrl;
    }

    const objectKey = pathSegments.slice(bucketIndex + 1).map(decodeURIComponent).join('/');
    return resolvePublicObjectUrl(config, objectKey) ?? trimmedUrl;
  } catch {
    return trimmedUrl;
  }
}
