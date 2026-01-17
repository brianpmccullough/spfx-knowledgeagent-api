import { Injectable } from '@nestjs/common';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfigurationService } from 'src/api/config/configuration.service';

@Injectable()
export class OboGraphService {
  private msalClient: ConfidentialClientApplication;

  constructor(private configService: ConfigurationService) {
    const { configuration, secrets } = this.configService;

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: configuration.AD_CLIENT_ID,
        clientSecret: secrets.AD_CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${configuration.AD_TENANT_ID}`,
      },
    });
  }

  async getGraphClient(userToken: string): Promise<Client> {
    const oboRequest = {
      oboAssertion: userToken,
      scopes: ['https://graph.microsoft.com/.default'],
    };

    const tokenResponse =
      await this.msalClient.acquireTokenOnBehalfOf(oboRequest);

    return Client.init({
      authProvider: (done) => {
        done(null, tokenResponse.accessToken);
      },
    });
  }
}
