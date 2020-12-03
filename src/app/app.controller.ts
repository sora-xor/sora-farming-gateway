import { Controller, Get } from '@nestjs/common';
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
    const uniswapXE = await this.poolsService.uniswap.getPairInfoByPair(
      UniswapConfig.XE.address,
    );
    const uniswapVE = await this.poolsService.uniswap.getPairInfoByPair(
      UniswapConfig.VE.address,
    );
    const uniswapXV = await this.poolsService.uniswap.getPairInfoByPair(
      UniswapConfig.XV.address,
    );

    const mooniswapXE = await this.poolsService.mooniswap.getPairInfoByPair(
      MooniswapConfig.XE.address,
    );
    const mooniswapVE = await this.poolsService.mooniswap.getPairInfoByPair(
      MooniswapConfig.VE.address,
    );
    const mooniswapXV = await this.poolsService.mooniswap.getPairInfoByPair(
      MooniswapConfig.XV.address,
    );

    return {
      XOR: new BN(uniswapXE.reserve0)
        .plus(uniswapXV.reserve0)
        .plus(mooniswapXE.reserve0)
        .plus(mooniswapXV.reserve0),
      VAL: new BN(uniswapVE.reserve0)
        .plus(uniswapXV.reserve1)
        .plus(mooniswapVE.reserve0)
        .plus(mooniswapXV.reserve1),
      ETH: new BN(uniswapXE.reserve1)
        .plus(uniswapVE.reserve1)
        .plus(mooniswapXE.reserve1)
        .plus(mooniswapVE.reserve1),
      XEL: new BN(uniswapXE.reserveUSD).plus(mooniswapXE.reserveUSD),
      VXL: new BN(uniswapXV.reserveUSD).plus(mooniswapXV.reserveUSD),
      VEL: new BN(uniswapVE.reserveUSD).plus(mooniswapVE.reserveUSD),
    };
  }
}
