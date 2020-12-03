import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MooniswapConfig,
  PoolsService,
  UniswapConfig,
} from 'src/pools/pools.service';
import { DatabaseService, EventName } from 'src/database/database.service';

import { fork } from 'child_process';
import path from 'path';
import BN from 'bignumber.js';
import { BLOCKS } from 'src/consts/consts';
import { CustomLoggerService } from 'src/logger/logger.service';

@Injectable()
export class TasksService
  implements OnApplicationBootstrap, OnApplicationShutdown {
  private rewardProcess;
  private updatePoolsInProgress = false;
  private updateReserveInProgress = false;

  constructor(
    private readonly poolsService: PoolsService,
    private readonly databaseService: DatabaseService,
    private readonly logger: CustomLoggerService,
  ) {}

  async onApplicationBootstrap() {
    await this.updateAllPools();
    await this.updatePoolReserve();

    this.rewardProcess = fork(path.resolve(__dirname, '../child/child'));
    this.rewardProcess.on('message', () => {
      this.updateUsersReward();
    });
  }

  onApplicationShutdown(signal) {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      this.logger.log(`main_process received signal - ${signal}`);
      return new Promise((resolve, reject) => {
        this.rewardProcess.kill('SIGTERM');
        this.rewardProcess.on('close', () => {
          const gracefullShutdown = setInterval(async () => {
            this.logger.log('Going to stop main_process');
            if (this.updatePoolsInProgress || this.updateReserveInProgress)
              return;
            clearInterval(gracefullShutdown);
            this.logger.log('Done! main_process stoped');
            resolve();
          }, 5 * 1000);
        });
      });
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateAllPools() {
    await this.updatePoolData(EventName.UniswapXE, UniswapConfig.XE.address);
    await this.updatePoolData(EventName.UniswapXV, UniswapConfig.XV.address);
    await this.updatePoolData(EventName.UniswapVE, UniswapConfig.VE.address);

    await this.updatePoolData(
      EventName.MooniswapXE,
      MooniswapConfig.XE.address,
    );
    await this.updatePoolData(
      EventName.MooniswapXV,
      MooniswapConfig.XV.address,
    );
    await this.updatePoolData(
      EventName.MooniswapVE,
      MooniswapConfig.VE.address,
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async updatePoolReserve() {
    if (this.updateReserveInProgress) return;
    this.updateReserveInProgress = true;

    try {
      const info = await this.databaseService.getInfo();
      const lastBlock = info.get('lastBlock');
      const block = lastBlock - BLOCKS.FIVE_MINUTES;
      const uniswap = {
        XE: await this.poolsService.uniswap.getPairReserveByPair(
          UniswapConfig.XE.address,
          block,
        ),
        XV: await this.poolsService.uniswap.getPairReserveByPair(
          UniswapConfig.XV.address,
          block,
        ),
        VE: await this.poolsService.uniswap.getPairReserveByPair(
          UniswapConfig.VE.address,
          block,
        ),
      };
      const mooniswap = {
        XE: await this.poolsService.mooniswap.getPairReserveByPair(
          MooniswapConfig.XE.address,
          block,
        ),
        XV: await this.poolsService.mooniswap.getPairReserveByPair(
          MooniswapConfig.XV.address,
          block,
        ),
        VE: await this.poolsService.mooniswap.getPairReserveByPair(
          MooniswapConfig.VE.address,
          block,
        ),
      };

      const liquidityUSD = new BN(0)
        .plus(uniswap.XE.reserveUSD)
        .plus(uniswap.XV.reserveUSD)
        .plus(uniswap.VE.reserveUSD)
        .plus(mooniswap.XE.reserveUSD)
        .plus(mooniswap.XV.reserveUSD)
        .plus(mooniswap.VE.reserveUSD)
        .toString();

      await this.databaseService.createLiquiditySnapshot({
        block,
        liquidityUSD,
      });
    } catch (error) {
      console.error(error);
    }

    this.updateReserveInProgress = false;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  updateUsersReward() {
    this.rewardProcess.send('UPDATE');
  }

  private async updatePoolData(pool: string, pairAddress: string) {
    if (this.updatePoolsInProgress) return;
    this.updatePoolsInProgress = true;

    try {
      const eventPool = this.databaseService.getEventPool(pool);
      const dbEvents = await eventPool.getEvents();
      let events = [];
      if (pool.includes('Uniswap')) {
        events = await this.poolsService.uniswap.getLiquidityEventsByPair(
          dbEvents.length,
          pairAddress,
        );
      }
      if (pool.includes('Mooniswap')) {
        events = await this.poolsService.mooniswap.getLiquidityEventsByPair(
          dbEvents.length,
          pairAddress,
        );
      }
      await eventPool.createEvents(events);
    } catch (error) {
      console.error(error);
    }

    this.updatePoolsInProgress = false;
  }
}
