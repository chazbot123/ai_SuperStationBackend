import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function resolveAmapWebServiceKey(configService: ConfigService) {
  const envKey = configService.get<string>('AMAP_WEB_SERVICE_KEY')?.trim() || '';
  if (!envKey) {
    throw new ServiceUnavailableException('未配置高德地图服务密钥');
  }

  return envKey;
}
