import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import {
  MooniswapConfig,
  PoolsService,
  UniswapConfig,
} from 'src/pools/pools.service';
import { DatabaseService, EventName } from 'src/database/database.service';

import { fork } from 'child_process';
import path from 'path';
import BN from 'bignumber.js';
import { BLOCKS } from 'src/consts';
import { CustomLoggerService } from 'src/logger/logger.service';
import { EthereumService } from 'src/ethereum/ethereum.service';

function parseReserveResponse(response) {
  const reserveMap = new Map<number, string>();
  for (const [key, value] of Object.entries(response) as Array<
    [string, { reserveUSD: string }]
  >) {
    const block = Number(key.slice(2));
    const oldValue = reserveMap.get(block);
    reserveMap.set(
      block,
      new BN(oldValue ? oldValue : 0).plus(value.reserveUSD).toString(),
    );
  }
  return new Map([...reserveMap].sort((a, b) => a[0] - b[0]));
}

@Injectable()
export class TasksService
  implements OnApplicationBootstrap, OnApplicationShutdown {
  private rewardProcess;
  private updatePoolsInProgress = false;
  private updateReserveInProgress = false;
  private populateDatabaseInProgress = true;

  constructor(
    private readonly poolsService: PoolsService,
    private readonly databaseService: DatabaseService,
    private readonly ethereumService: EthereumService,
    private readonly logger: CustomLoggerService,
  ) {}

  async onApplicationBootstrap() {
    this.rewardProcess = fork(path.resolve(__dirname, '../child/child'));
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
    if (this.populateDatabaseInProgress) return;
    if (this.updateReserveInProgress) return;
    this.updateReserveInProgress = true;

    const info = await this.databaseService.getInfo();
    const lastBlock = info.get('lastBlock');
    const lastBlockWithOffset = lastBlock - BLOCKS.FIVE_MINUTES;

    await this.getUpdateReserve(lastBlockWithOffset);

    this.updateReserveInProgress = false;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  updateUsersReward() {
    if (this.populateDatabaseInProgress) return;
    if (this.rewardProcess) {
      this.rewardProcess.send('UPDATE');
    }
  }

  @Timeout(5 * 1000)
  private async populateDatabase() {
    let lastBlock = 0;

    try {
      lastBlock = await this.ethereumService.getLastBlock();
    } catch (error) {
      this.populateDatabaseInProgress = false;
      console.error(error);
      return;
    }

    await this.updateAllPools();

    const info = await this.databaseService.getInfo();
    const startBlock = info.get('lastBlock');
    const startBlockWithOffset = startBlock - BLOCKS.FIVE_MINUTES;
    const lastBlockWithOffset = lastBlock - BLOCKS.FIVE_MINUTES;
    this.logger.log(
      `Going to populate database\nStart block: ${startBlockWithOffset}\nLast block: ${lastBlockWithOffset}`,
    );

    // One request returns 10 elements, distance between elements 20 blocks
    // So one step is 200 blocks
    const step = (BLOCKS.FIVE_MINUTES - 5) * 10;

    for (
      let currentBlock = startBlockWithOffset;
      currentBlock + step < lastBlockWithOffset;
      currentBlock += (BLOCKS.FIVE_MINUTES - 5) * 10
    ) {
      await this.getUpdateReserveInRange(currentBlock, currentBlock + step);
    }
    this.logger.log('Population complete');
    this.populateDatabaseInProgress = false;

    this.updateUsersReward();
  }

  private async getUpdateReserve(block: number) {
    try {
      const uniswap = await this.poolsService.uniswap.getPairReserveByPair(
        {
          XE: UniswapConfig.XE.address,
          XV: UniswapConfig.XV.address,
          VE: UniswapConfig.VE.address,
        },
        block,
      );
      const mooniswap = await this.poolsService.mooniswap.getPairReserveByPair(
        {
          XE: MooniswapConfig.XE.address,
          XV: MooniswapConfig.XV.address,
          VE: MooniswapConfig.VE.address,
        },
        block,
      );

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
  }

  private async getUpdateReserveInRange(firstBlock: number, lastBlock: number) {
    try {
      const uniswap = await this.poolsService.uniswap.getPairReserveByPairInRange(
        {
          XE: UniswapConfig.XE.address,
          XV: UniswapConfig.XV.address,
          VE: UniswapConfig.VE.address,
        },
        {
          firstBlock,
          lastBlock,
        },
      );
      const mooniswap = await this.poolsService.mooniswap.getPairReserveByPairInRange(
        {
          XE: MooniswapConfig.XE.address,
          XV: MooniswapConfig.XV.address,
          VE: MooniswapConfig.VE.address,
        },
        {
          firstBlock,
          lastBlock,
        },
      );

      const uniswapReserves = parseReserveResponse(uniswap);
      const mooniswapReserve = parseReserveResponse(mooniswap);

      for (const block of uniswapReserves.keys()) {
        const uValue = uniswapReserves.get(block);
        const mValue = mooniswapReserve.get(block);
        const liquidityUSD = new BN(0)
          .plus(uValue)
          .plus(mValue)
          .toString();

        await this.databaseService.createLiquiditySnapshot({
          block,
          liquidityUSD,
        });
      }
    } catch (error) {
      console.error(error);
    }
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
