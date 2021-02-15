import { Injectable } from '@nestjs/common';
import { DatabaseService, EventName } from 'src/database/database.service';
import { EthereumService } from 'src/ethereum/ethereum.service';
import { RewardService } from 'src/reward/reward.service';

import BN from 'bignumber.js';
import { User } from 'src/schemas/user.schema';
import { BLOCK_OFFSET, MAX_PSWAP } from 'src/consts';
import { CustomLoggerService } from 'src/logger/logger.service';

function getLastBlockWithOffset(block: number): BN {
  return new BN(block).minus(BLOCK_OFFSET)
}

function getAmountPSWAP(reward: BN, currentAmountPSWAP: BN): BN {
  if (currentAmountPSWAP.gte(MAX_PSWAP)) return new BN(0);
  if (currentAmountPSWAP.plus(reward).lt(MAX_PSWAP)) return reward;

  return MAX_PSWAP.minus(currentAmountPSWAP);
}

function createCacheStorage(): {
  XE: Map<number, BN>;
  XV: Map<number, BN>;
  VE: Map<number, BN>;
} {
  return {
    XE: new Map<number, BN>(),
    XV: new Map<number, BN>(),
    VE: new Map<number, BN>(),
  };
}

@Injectable()
export class ChildService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly ethereumService: EthereumService,
    private readonly rewardService: RewardService,
    private readonly logger: CustomLoggerService,
  ) {}

  async updateUserReward() {
    const uniswapEvents = {
      XE: await this.databaseService
        .getEventPool(EventName.UniswapXE)
        .getEvents(),
      XV: await this.databaseService
        .getEventPool(EventName.UniswapXV)
        .getEvents(),
      VE: await this.databaseService
        .getEventPool(EventName.UniswapVE)
        .getEvents(),
    };
    const mooniswapEvents = {
      XE: await this.databaseService
        .getEventPool(EventName.MooniswapXE)
        .getEvents(),
      XV: await this.databaseService
        .getEventPool(EventName.MooniswapXV)
        .getEvents(),
      VE: await this.databaseService
        .getEventPool(EventName.MooniswapVE)
        .getEvents(),
    };

    const liquiditySnapshots = await this.databaseService.getLiquiditySnapshot();

    let lastBlock = 0;

    try {
      lastBlock = await this.ethereumService.getLastBlock();
    } catch (error) {
      console.error(error);
      return;
    }

    const users = await this.uniqueUsersAddress();

    const info = await this.databaseService.getInfo();
    const currentAmountPSWAP = new BN(info.get('pswap'));
    const startBlock = info.get('startBlock');
    const lastProcessedBlock = info.get('lastBlock');
    const lastBlockWithOffset = getLastBlockWithOffset(lastBlock).toNumber();
    const formulaUpdateBlock = info.get('formulaUpdateBlock');
    const cache = createCacheStorage();

    if (currentAmountPSWAP.gte(MAX_PSWAP)) return;
    if (new BN(lastProcessedBlock).eq(lastBlockWithOffset)) return;
    if (new BN(lastBlockWithOffset).lte(startBlock)) return;
    if (info.get('status') === 0) {
      this.logger.log(`⚠️ Game is stopped\nInformation: ${info}`);
      return;
    }

    let newAmountPSWAP = currentAmountPSWAP;
    this.logger.log(
      `Begin of reward calculation\nStart block: ${lastProcessedBlock}\nLast block: ${lastBlockWithOffset}`,
    );
    for (const address of users) {
      if (newAmountPSWAP.gte(MAX_PSWAP)) continue;
      const { user, reward } = await this.rewardService.getRewardByAddress(
        address,
        {
          startBlock,
          lastBlock: lastBlockWithOffset,
          formulaUpdateBlock,
        },
        {
          uniswap: uniswapEvents,
          mooniswap: mooniswapEvents,
        },
        liquiditySnapshots,
        cache,
      );
      const realAmount = getAmountPSWAP(reward, newAmountPSWAP);
      await this.updateUserData(user, lastBlockWithOffset, realAmount);
      newAmountPSWAP = newAmountPSWAP.plus(realAmount);
    }

    info.set('pswap', newAmountPSWAP.toString());
    info.set('lastBlock', lastBlockWithOffset);
    info.set('lastUpdateTimestamp', new Date().toISOString());

    await this.databaseService.updateInfo(info);
    this.logger.log('End of reward calculation');
  }

  private async uniqueUsersAddress(): Promise<string[]> {
    return [
      ...new Set([
        ...(await this.databaseService
          .getEventPool(EventName.UniswapXE)
          .getUsersAddress()),
        ...(await this.databaseService
          .getEventPool(EventName.UniswapXV)
          .getUsersAddress()),
        ...(await this.databaseService
          .getEventPool(EventName.UniswapVE)
          .getUsersAddress()),
        ...(await this.databaseService
          .getEventPool(EventName.MooniswapXE)
          .getUsersAddress()),
        ...(await this.databaseService
          .getEventPool(EventName.MooniswapXV)
          .getUsersAddress()),
        ...(await this.databaseService
          .getEventPool(EventName.MooniswapVE)
          .getUsersAddress()),
      ]),
    ];
  }

  private async updateUserData(
    user: User,
    lastBlock: number,
    reward: BN,
  ): Promise<void> {
    const oldReward = user.get('reward');
    user.set('reward', new BN(oldReward).plus(reward).toString());
    user.set('lastBlock', lastBlock);
    await this.databaseService.updateUser(user);
  }
}
