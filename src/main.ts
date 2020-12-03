import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { AppConfigService } from './config/config.service';
import { CustomLoggerService } from './logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new CustomLoggerService(),
  });
  const appConfig: AppConfigService = app.get('AppConfigService');
  app.enableCors();
  app.setGlobalPrefix('/api');
  app.enableShutdownHooks();
  await app.listen(appConfig.port, appConfig.host);
}
bootstrap();
