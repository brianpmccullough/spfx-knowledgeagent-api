import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AzureADStrategy } from './azure-ad.strategy';
import { ConfigurationModule } from 'src/api/config/configuration.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'azure-ad' }),
    ConfigurationModule,
  ],
  providers: [AzureADStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
