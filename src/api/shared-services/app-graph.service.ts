import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfigurationService } from '../config/configuration.service';

/**
 * App-Only Graph Service
 * Uses client credentials flow (app-only permissions) rather than delegated/OBO.
 * Suitable for background processes that don't run in user context.
 */
@Injectable()
export class AppGraphService implements OnModuleInit {
  private readonly logger = new Logger(AppGraphService.name);
  private msalClient: ConfidentialClientApplication;
  private graphClient: Client;

  constructor(private readonly configurationService: ConfigurationService) {}

  async onModuleInit() {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const { configuration, secrets } = this.configurationService;

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: configuration.AD_CLIENT_ID,
        clientSecret: secrets.AD_CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${configuration.AD_TENANT_ID}`,
      },
    });

    this.graphClient = Client.init({
      authProvider: async (done) => {
        try {
          const result = await this.msalClient.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
          });

          if (result?.accessToken) {
            done(null, result.accessToken);
          } else {
            done(new Error('Failed to acquire access token'), null);
          }
        } catch (error) {
          this.logger.error('Failed to acquire token', error);
          done(error as Error, null);
        }
      },
    });

    this.logger.log('App-only Graph client initialized');
  }

  getClient(): Client {
    return this.graphClient;
  }
}
