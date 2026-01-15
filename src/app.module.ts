import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeModule } from './api/me/me.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './api/chat/chat.module';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
