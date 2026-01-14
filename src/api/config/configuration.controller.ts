import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { AzureADGuard } from 'src/auth/azure-ad.guard';

@Controller('api/config')
@UseGuards(AzureADGuard)
export class ConfigurationController {
  constructor(private readonly configService: ConfigurationService) {}

  @Get()
  getConfiguration() {
    return {
      configuration: this.configService.configuration,
      secrets: this.configService.secrets,
    };
  }
}
