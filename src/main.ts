import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [/\.sharepoint\.com$/],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const url = await app.getUrl();
  console.log(url);
}
bootstrap();
