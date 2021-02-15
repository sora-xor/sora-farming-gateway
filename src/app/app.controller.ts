import { Body, Controller, Get, HttpException, Post } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {
  MooniswapConfig,
  PoolsService,
  UniswapConfig,
} from 'src/pools/pools.service';
import BN from 'bignumber.js';

@Controller('app')
export class AppController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly poolsService: PoolsService,
  ) {}

  @Get('health')
  healthCheck() {
    return {
      status: 'up',
    };
  }

  @Get('info')
  async info() {
    const info = await this.databaseService.getInfo();

    return {
      timestamp: Date.now(),
      startBlock: info.get('startBlock'),
      lastUpdateTimestamp: info.get('lastUpdateTimestamp'),
      lastBlock: info.get('lastBlock'),
      totalPswap: info.get('pswap'),
    };
  }

  @Get('total')
  async total() {
    const uniswap = await this.poolsService.uniswap.getPairInfoByPair({
      XE: UniswapConfig.XE.address,
      XV: UniswapConfig.XV.address,
      VE: UniswapConfig.VE.address,
    });
    const mooniswap = await this.poolsService.mooniswap.getPairInfoByPair({
      XE: MooniswapConfig.XE.address,
      XV: MooniswapConfig.XV.address,
      VE: MooniswapConfig.VE.address,
    });

    return {
      XOR: new BN(uniswap.XE.reserve0)
        .plus(uniswap.XV.reserve0)
        .plus(mooniswap.XE.reserve0)
        .plus(mooniswap.XV.reserve0),
      VAL: new BN(uniswap.VE.reserve0)
        .plus(uniswap.XV.reserve1)
        .plus(mooniswap.VE.reserve0)
        .plus(mooniswap.XV.reserve1),
      ETH: new BN(uniswap.XE.reserve1)
        .plus(uniswap.VE.reserve1)
        .plus(mooniswap.XE.reserve1)
        .plus(mooniswap.VE.reserve1),
      XEL: new BN(uniswap.XE.reserveUSD).plus(mooniswap.XE.reserveUSD),
      XVL: new BN(uniswap.XV.reserveUSD).plus(mooniswap.XV.reserveUSD),
      VEL: new BN(uniswap.VE.reserveUSD).plus(mooniswap.VE.reserveUSD),
    };
  }

  @Post('status')
  async updateGameStatus(@Body() data: { status: number }) {
    if (![0,1].includes(data.status)) {
      throw new HttpException(
        {
          error: {
            message:
              'The "status" field has the wrong value. Valid values are 0 or 1.',
            params: {
              status: data.status,
            },
          },
        },
        400,
      );
    }
    const info = await this.databaseService.getInfo();

    info.set('status', data.status);
    await this.databaseService.updateInfo(info);
    return {
      status: data.status,
    };
  }
}
