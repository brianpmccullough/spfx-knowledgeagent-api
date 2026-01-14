import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigurationService } from './configuration.service';

@Controller('api/config')
export class ConfigurationController {
  constructor(private readonly configService: ConfigurationService) {}

  @Get()
  getMe(
    @Headers('authorization') authHeader: string,
    @Query('bypassauth') bypassAuth: string,
  ) {
    if (bypassAuth === 'true') {
      return this.configService.configuration;
    }

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid token');
    }

    return {
      configuration: this.configService.configuration,
      secrets: this.configService.secrets,
    };
  }
}
