import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeModule } from './api/me/me.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './api/chat/chat.module';
import { SharedServicesModule } from './api/shared-services/shared-services.module';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MeModule,
    SharedServicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
