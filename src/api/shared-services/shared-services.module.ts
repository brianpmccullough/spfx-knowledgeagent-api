import { Global, Module } from '@nestjs/common';
import { OboGraphService } from './obo-graph.service';
import { ConfigurationModule } from '../config/configuration.module';

@Global()
@Module({
  imports: [ConfigurationModule],
  providers: [OboGraphService],
  exports: [OboGraphService],
})
export class SharedServicesModule {}
