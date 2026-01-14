import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigurationService {
  constructor(private readonly configService: ConfigService) {}

  get configuration() {
    return {
      AD_TENANT_NAME: this.configService.get<string>('AD_TENANT_NAME'),
      AD_TENANT_ID: this.configService.get<string>('AD_TENANT_ID'),
      AD_CLIENT_ID: this.configService.get<string>('AD_CLIENT_ID'),
    };
  }

  get secrets() {
    return {
      AD_CLIENT_SECRET: this.configService.get<string>('AD_CLIENT_SECRET'),
    };
  }
}
