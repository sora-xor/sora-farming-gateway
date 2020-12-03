import { Injectable } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';

export const configFactory = registerAs('app', () => ({
  ethereum: process.env.APP_ETHEREUM,
  ethereumStartBlock: process.env.APP_ETHEREUM_START_BLOCK,
  database: process.env.APP_DATABASE,
  host: process.env.APP_HOST,
  port: process.env.APP_PORT,
}));

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get port(): string {
    return this.configService.get('app.port');
  }

  get host(): string {
    return this.configService.get('app.host');
  }

  get ethereumNode(): string {
    return this.configService.get('app.ethereum');
  }

  get ethereumStartBlock(): number {
    const block = this.configService.get('app.ethereumStartBlock');
    return block ? Number(block) : 0;
  }

  get database(): string {
    return this.configService.get('app.database');
  }
}
