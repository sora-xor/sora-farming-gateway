import { Injectable } from '@nestjs/common';
import { LoggerService } from '@nestjs/common';

@Injectable()
export class CustomLoggerService implements LoggerService {
  log(message: string) {
    const msg = `${new Date().toISOString()} [info] ${message}\n`;
    process.stdout.write(msg);
  }
  error(message: string, trace: string) {
    const msg = `${new Date().toISOString()} [error] ${message} ${trace}\n`;
    process.stdout.write(msg);
  }
  warn(message: string) {
    console.warn(message);
  }
  debug(message: string) {
    console.debug(message);
  }
  verbose(message: string) {
    console.log(message);
  }
}
