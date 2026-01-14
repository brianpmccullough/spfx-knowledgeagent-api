import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { BearerStrategy } from 'passport-azure-ad';
import { ConfigurationService } from 'src/api/config/configuration.service';
import { AuthenticatedUser } from './authenticateduser';

interface AzureADPayload {
  oid: string;
  preferred_username?: string;
  upn?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  roles?: string[];
  [key: string]: any;
}

@Injectable()
export class AzureADStrategy extends PassportStrategy(
  BearerStrategy,
  'azure-ad',
) {
  constructor(configurationService: ConfigurationService) {
    const { AD_CLIENT_ID, AD_TENANT_ID } = configurationService.configuration;

    super({
      identityMetadata: `https://login.microsoftonline.com/${AD_TENANT_ID}/v2.0/.well-known/openid-configuration`,
      clientID: AD_CLIENT_ID,
      audience: AD_CLIENT_ID,
      validateIssuer: true,
      issuer: `https://sts.windows.net/${AD_TENANT_ID}/`,
      loggingLevel: 'error',
      passReqToCallback: false,
    });
  }

  async validate(
    payload: AzureADPayload,
  ): Promise<Omit<AuthenticatedUser, 'token'>> {
    return {
      id: payload.oid,
      email: payload.upn || payload.preferred_username || payload.email || '',
      name: payload.name || '',
      firstName: payload.given_name || '',
      lastName: payload.family_name || '',
      roles: payload.roles || [],
      claims: payload,
    };
  }
}
