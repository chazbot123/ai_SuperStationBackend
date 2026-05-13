import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HARDCODED_AMAP_WEB_SERVICE_KEY = 'a036d54ac4e7a4e29ff8bcf11ee1bc62';
const ENABLE_AMAP_ENV_OVERRIDE = false;

export function resolveAmapWebServiceKey(configService: ConfigService) {
  const envKey = configService.get<string>('AMAP_WEB_SERVICE_KEY')?.trim() || '';
  const resolvedKey =
    ENABLE_AMAP_ENV_OVERRIDE && envKey ? envKey : HARDCODED_AMAP_WEB_SERVICE_KEY.trim();

  if (!resolvedKey) {
    throw new ServiceUnavailableException('未配置高德地图服务密钥');
  }

  return resolvedKey;
}
