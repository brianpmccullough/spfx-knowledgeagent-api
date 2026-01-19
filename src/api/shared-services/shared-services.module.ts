import { Global, Module } from '@nestjs/common';
import { OboGraphService } from './obo-graph.service';
import { ConfigurationModule } from '../config/configuration.module';
import { AppGraphService } from './app-graph.service';

@Global()
@Module({
  imports: [ConfigurationModule],
  providers: [OboGraphService, AppGraphService],
  exports: [OboGraphService, AppGraphService],
})
export class SharedServicesModule {}
