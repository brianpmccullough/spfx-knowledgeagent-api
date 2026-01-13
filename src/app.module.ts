import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeController } from './api/me/me.controller';

@Module({
  imports: [],
  controllers: [AppController, MeController],
  providers: [AppService],
})
export class AppModule {}
