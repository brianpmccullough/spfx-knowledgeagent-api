import { Injectable } from '@nestjs/common';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfigurationService } from '../config/configuration.service';

@Injectable()
export class MeService {
  private msalClient: ConfidentialClientApplication;

  constructor(private readonly configurationService: ConfigurationService) {
    const { configuration, secrets } = this.configurationService;
    //console.log(configuration);
    //console.log(secrets);
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: configuration.AD_CLIENT_ID,
        clientSecret: secrets.AD_CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${configuration.AD_TENANT_ID}`,
      },
    });
  }

  async getMe(userToken: string) {
    // Exchange SPFx token for Graph token (OBO flow)
    const oboRequest = {
      oboAssertion: userToken,
      scopes: ['https://graph.microsoft.com/User.Read'],
    };

    const tokenResponse =
      await this.msalClient.acquireTokenOnBehalfOf(oboRequest);

    const graphClient = Client.init({
      authProvider: (done) => {
        done(null, tokenResponse.accessToken);
      },
    });

    const user = await graphClient
      .api('/me')
      .select(
        [
          'id',
          'displayName',
          'givenName',
          'surname',
          'userPrincipalName',
          'mail',
          'jobTitle',
          'department',
          'companyName',
          'officeLocation',
          'mobilePhone',
          'businessPhones',
          'preferredLanguage',
          'city',
          'state',
          'country',
        ].join(','),
      )
      .get();

    return user;
  }
}
