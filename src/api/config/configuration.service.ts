import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigurationService {
  constructor(private readonly configService: ConfigService) {
    console.log(this.configuration);
    // console.log(this.secrets);
  }

  get configuration() {
    return {
      AD_TENANT_NAME: this.configService.get<string>('AD_TENANT_NAME'),
      AD_TENANT_ID: this.configService.get<string>('AD_TENANT_ID'),
      AD_CLIENT_ID: this.configService.get<string>('AD_CLIENT_ID'),
      AZURE_OPENAI_ENDPOINT: this.configService.get<string>(
        'AZURE_OPENAI_ENDPOINT',
      ),
      AZURE_OPENAI_DEPLOYMENT: this.configService.get<string>(
        'AZURE_OPENAI_DEPLOYMENT',
      ),
      AZURE_OPENAI_API_VERSION: this.configService.get<string>(
        'AZURE_OPENAI_API_VERSION',
      ),
    };
  }

  get secrets() {
    return {
      AD_CLIENT_SECRET: this.configService.get<string>('AD_CLIENT_SECRET'),
      AZURE_OPENAI_API_KEY: this.configService.get<string>(
        'AZURE_OPENAI_API_KEY',
      ),
    };
  }
}
