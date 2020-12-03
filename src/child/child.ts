import { NestFactory } from '@nestjs/core';
import { CustomLoggerService } from 'src/logger/logger.service';
import { ChildModule } from './child.module';
import { ChildService } from './child.service';

let isBusy = false;

async function bootstrap() {
  const app = await NestFactory.create(ChildModule, {
    logger: new CustomLoggerService(),
  });
  const service = app.get(ChildService);
  const logger = app.get(CustomLoggerService);

  process.on('message', async () => {
    if (isBusy) return;
    isBusy = true;
    await service.updateUserReward();
    isBusy = false;
  });

  process.on('SIGTERM', () => {
    logger.log('child_process received signal - SIGTERM');
    const gracefullShutdown = setInterval(async () => {
      logger.log('Going to stop child_process');
      if (isBusy) return;
      clearInterval(gracefullShutdown);
      await app.close();
      logger.log('Done! child_process stoped');
      process.exit(0);
    }, 5 * 1000);
  });

  process.send('READY');
}

bootstrap();
