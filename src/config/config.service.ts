import { Injectable } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';

export const configFactory = registerAs('app', () => ({
  ethereum: process.env.APP_ETHEREUM,
  ethereumStartBlock: process.env.APP_ETHEREUM_START_BLOCK,
  ethereumFormulaUpdateBlock: process.env.APP_ETHEREUM_FORMULA_UPDATE_BLOCK,
  database: process.env.APP_DATABASE,
  host: process.env.APP_HOST,
  port: process.env.APP_PORT,
}));

const getBlock = (block: string | (null | undefined)) =>
  block ? Number(block) : 0;

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
    return getBlock(this.configService.get('app.ethereumStartBlock'));
  }

  /**
   * The function returns a block (number)
   * that will be used in the rewards service.
   * Starting from this block the formula counts differently.
   *
   * @readonly
   * @type {number}
   * @memberof AppConfigService
   */
  get ethereumFormulaUpdateBlock(): number {
    return getBlock(this.configService.get('app.ethereumFormulaUpdateBlock'));
  }

  get database(): string {
    return this.configService.get('app.database');
  }
}
