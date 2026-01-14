import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeModule } from './api/me/me.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
