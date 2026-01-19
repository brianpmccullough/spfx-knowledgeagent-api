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
      AZURE_OPENAI_ENDPOINT: this.configService.get<string>('AZURE_OPENAI_ENDPOINT'),
      AZURE_OPENAI_DEPLOYMENT: this.configService.get<string>('AZURE_OPENAI_DEPLOYMENT'),
      AZURE_OPENAI_EMBEDDING_DEPLOYMENT: this.configService.get<string>(
        'AZURE_OPENAI_EMBEDDING_DEPLOYMENT',
      ),
      AZURE_OPENAI_API_VERSION: this.configService.get<string>('AZURE_OPENAI_API_VERSION'),
      AZURE_SEARCH_ENDPOINT: this.configService.get<string>('AZURE_SEARCH_ENDPOINT'),
      AZURE_SEARCH_INDEX_NAME: this.configService.get<string>('AZURE_SEARCH_INDEX_NAME'),
      KNOWLEDGE_INDEXER_ENABLED:
        this.configService.get<boolean>('KNOWLEDGE_INDEXER_ENABLED') || true,
      KNOWLEDGE_INDEXER_INTERVAL_MS:
        this.configService.get<number>('KNOWLEDGE_INDEXER_INTERVAL_MS') || 3600000,
      SHAREPOINT_GEO: this.configService.get<number>('SHAREPOINT_GEO') || 'US',
      DEFAULT_SEARCH_MODE: this.configService.get<number>('DEFAULT_SEARCH_MODE') || 'kql',
    };
  }

  get secrets() {
    return {
      AD_CLIENT_SECRET: this.configService.get<string>('AD_CLIENT_SECRET'),
      AZURE_OPENAI_API_KEY: this.configService.get<string>('AZURE_OPENAI_API_KEY'),
      AZURE_SEARCH_ADMIN_KEY: this.configService.get<string>('AZURE_SEARCH_ADMIN_KEY'),
    };
  }
}
