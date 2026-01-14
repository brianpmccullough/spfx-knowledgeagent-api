import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { ConfigurationModule } from '../config/configuration.module';

@Module({
  controllers: [MeController],
  imports: [ConfigurationModule],
  providers: [MeService],
})
export class MeModule {}
