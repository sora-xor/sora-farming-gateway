import { Injectable } from '@nestjs/common';
import BN from 'bignumber.js';
import { DatabaseService } from 'src/database/database.service';
import { LiquidityEvent, UserPoolStatistic } from 'src/pools/pools.interface';
import { User } from 'src/schemas/user.schema';
import {
  Liquidity,
  LiquidityPool,
  TotalLiquidity,
  PoolLiquidityEvents,
} from './reward.interface';
import last from 'lodash/last';
import {
  MooniswapConfig,
  PoolsService,
  UniswapConfig,
} from 'src/pools/pools.service';
import { BLOCKS } from 'src/consts/consts';

BN.config({ DECIMAL_PLACES: 10 });

const uniqueEventsByUser = (events: LiquidityEvent[]): LiquidityEvent[] => {
  const users = new Set();
  const result = [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (users.has(events[i].user.id)) continue;
    users.add(events[i].user.id);
    result.push(events[i]);
  }
  return result.slice().reverse();
};

const sortEvents = (
  eventsA: LiquidityEvent[],
  eventsB: LiquidityEvent[],
): LiquidityEvent[] => {
  return [...eventsA, ...eventsB].sort(
    (eventA: LiquidityEvent, eventB: LiquidityEvent) =>
      eventA.block - eventB.block,
  );
};

const getUserLiquidityEvents = (
  user: User,
  {
    uniswap,
    mooniswap,
  }: {
    uniswap: LiquidityEvent[];
    mooniswap: LiquidityEvent[];
  },
) => {
  const address: string = user.get('address');
  return {
    uniswap: uniswap.filter(({ user }) => user.id === address),
    mooniswap: mooniswap.filter(({ user }) => user.id === address),
  };
};

@Injectable()
export class RewardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly poolsService: PoolsService,
  ) {}

  async getRewardByAddress(
    address: string,
    blocks: {
      startBlock: number;
      lastBlock: number;
    },
    pool: {
      uniswap: PoolLiquidityEvents;
      mooniswap: PoolLiquidityEvents;
    },
    liquiditySnapshots: TotalLiquidity[],
  ): Promise<{ user: User; reward: BN }> {
    const user = await this.getUserModel(address);

    const rewardXE = this.calculateReward(
      {
        uniswap: pool.uniswap.XE,
        mooniswap: pool.mooniswap.XE,
      },
      liquiditySnapshots,
      user,
      blocks.startBlock,
      blocks.lastBlock,
    );
    const rewardXV = this.calculateReward(
      {
        uniswap: pool.uniswap.XV,
        mooniswap: pool.mooniswap.XV,
      },
      liquiditySnapshots,
      user,
      blocks.startBlock,
      blocks.lastBlock,
    );
    const rewardVE = this.calculateReward(
      {
        uniswap: pool.uniswap.VE,
        mooniswap: pool.mooniswap.VE,
      },
      liquiditySnapshots,
      user,
      blocks.startBlock,
      blocks.lastBlock,
    );

    const reward = new BN(0)
      .plus(rewardXE)
      .plus(rewardXV)
      .plus(rewardVE);

    return {
      user,
      reward,
    };
  }

  async getLiquidityByAddress(address: string): Promise<Liquidity> {
    const uniswap = await this.poolsService.uniswap.getUserStatsByPairs(
      address,
      [
        UniswapConfig.XE.address,
        UniswapConfig.XV.address,
        UniswapConfig.VE.address,
      ],
    );
    const mooniswap = await this.poolsService.mooniswap.getUserStatsByPairs(
      address,
      [
        MooniswapConfig.XE.address,
        MooniswapConfig.XV.address,
        MooniswapConfig.VE.address,
      ],
    );
    return {
      XE: this.calculateLiquidity({
        uniswap: uniswap[0],
        mooniswap: mooniswap[0],
      }),
      XV: this.calculateLiquidity({
        uniswap: uniswap[1],
        mooniswap: mooniswap[1],
      }),
      VE: this.calculateLiquidity({
        uniswap: uniswap[2],
        mooniswap: mooniswap[2],
      }),
    };
  }

  private calculateLiquidity(user: {
    uniswap: UserPoolStatistic;
    mooniswap: UserPoolStatistic;
  }): LiquidityPool {
    const check = (v: BN) => (v.isFinite() ? v : new BN(0));
    const uniswapStats = user.uniswap;
    const mooniswapStats = user.mooniswap;

    if (
      new BN(uniswapStats.liquidityTokenBalance).eq(0) &&
      new BN(mooniswapStats.liquidityTokenBalance).eq(0)
    )
      return { token0: '0', token1: '0', percent: '0' };

    const uniswapPercent = check(
      new BN(uniswapStats.liquidityTokenBalance).div(
        uniswapStats.pair.totalSupply,
      ),
    );
    const mooniswapPercent = check(
      new BN(mooniswapStats.liquidityTokenBalance).div(
        mooniswapStats.pair.totalSupply,
      ),
    );
    const userToken0Amount = new BN(0)
      .plus(uniswapPercent.multipliedBy(uniswapStats.pair.reserve0))
      .plus(mooniswapPercent.multipliedBy(mooniswapStats.pair.reserve0));
    const userToken1Amount = new BN(0)
      .plus(uniswapPercent.multipliedBy(uniswapStats.pair.reserve1))
      .plus(mooniswapPercent.multipliedBy(mooniswapStats.pair.reserve1));

    const reserve0 = new BN(0)
      .plus(uniswapStats.pair.reserve0)
      .plus(mooniswapStats.pair.reserve0);

    const overallPercent = new BN(userToken0Amount).div(reserve0);

    return {
      token0: userToken0Amount.toString(),
      token1: userToken1Amount.toString(),
      percent: overallPercent.toString(),
    };
  }

  private calculateReward(
    events: {
      uniswap: LiquidityEvent[];
      mooniswap: LiquidityEvent[];
    },
    liquiditySnapshots: TotalLiquidity[],
    user: User,
    startBlock: number,
    lastBlock: number,
  ): BN {
    const userLiquidityEvents = getUserLiquidityEvents(user, events);

    if (
      !userLiquidityEvents.uniswap.length &&
      !userLiquidityEvents.mooniswap.length
    )
      return new BN(0);

    const reward = this.formula(
      {
        userStartBlock: user.get('lastBlock'),
        gameStartBlock: startBlock,
        ethLatestBlock: lastBlock,
      },
      liquiditySnapshots,
      userLiquidityEvents,
      events,
    );

    return reward;
  }

  private formula(
    blocks: {
      userStartBlock: number;
      gameStartBlock: number;
      ethLatestBlock: number;
    },
    liquiditySnapshots: TotalLiquidity[],
    userLiquidityEvents: {
      uniswap: LiquidityEvent[];
      mooniswap: LiquidityEvent[];
    },
    events: {
      uniswap: LiquidityEvent[];
      mooniswap: LiquidityEvent[];
    },
  ): BN {
    const T = BLOCKS.THREE_MONTHS;
    const blockDiffTime = (startBlock: number | BN, currentBlock: number) =>
      new BN(currentBlock).minus(startBlock);
    /**
     * Vesting coefficient to incentivise users who provide liquidity for a long time
     * Vi(t)=(1+(ti)/t)^6
     * @param userTime - Total time (in blocks) liquidity provided by the user i
     * @param gameTime - Game time in blocks
     */
    const Vi = (userTime: BN, gameTime: BN) =>
      new BN(1).plus(new BN(userTime).div(gameTime)).pow(6);
    /**
     * Total PSWAP rewards across 3 pools
     * @param liq - Total liquidity provided across all pools in fiat units
     */
    const liquidity = (liq: BN) => {
      if (liq.lt(new BN(12).multipliedBy(1000000))) return new BN(1000000);
      else if (liq.gt(new BN(24).multipliedBy(1000000))) return new BN(2000000);
      return liq.dividedBy(12);
    };
    /**
     * Reward at time t for 1 pool
     * p(t) = (2 * П/3 * (T - t - 1)) / T^2
     * @param gameTime - Time in blocks
     * @param liquidityAmount - Total PSWAP rewards across 3 pools
     */
    const p = (gameTime: BN, liquidityAmount: BN) =>
      new BN(2)
        .multipliedBy(liquidity(liquidityAmount).div(3))
        .multipliedBy(new BN(T).minus(gameTime).minus(1))
        .div(new BN(T).pow(2));
    /**
     * Reward for a user i at time t with vesting coefficient
     * Ri(t) = p(t) * ((Vi(t) * pi) / (sum(Vu(t) * pu))
     * @param userTime - Total time (in blocks) liquidity provided by the user i
     * @param gameTime - Game time in blocks
     * @param liquidityAmount - Total PSWAP rewards across 3 pools
     * @param tokensAmount - User tokens amount (in USD) for 1 pool
     * @param otherUsersVi - Sum of all user's tokens for 1 pool
     */
    const Rm = (
      userTime: BN,
      gameTime: BN,
      liquidityAmount: BN,
      tokensAmount: BN,
      otherUsersVi: BN,
    ) =>
      new BN(p(gameTime, liquidityAmount)).multipliedBy(
        Vi(userTime, gameTime)
          .multipliedBy(tokensAmount)
          .dividedBy(otherUsersVi),
      );
    /**
     * Calculates the number of tokens for user
     * tokens = liqBalance / liqTotal * reserve / 2
     * @param userEvent - Latest user event (Check interface for more info). Represents information from DEX
     * @param lastEvent - Latest avaliable event in the pool (Check interface for more info). Represents information from DEX
     */
    const calcUserTokensAmount = (
      userEvent: LiquidityEvent,
      lastEvent: LiquidityEvent,
    ) =>
      new BN(userEvent.liquidityTokenBalance)
        .div(lastEvent.liquidityTokenTotalSupply)
        .multipliedBy(lastEvent.reserveUSD)
        .div(2);
    const checkFinite = (v: BN, min: BN) => (v.isFinite() ? v : min);

    const getLastEvents = (
      events: {
        uniswap: LiquidityEvent[];
        mooniswap: LiquidityEvent[];
      },
      currentBlock: number,
    ): {
      uniswap: LiquidityEvent;
      mooniswap: LiquidityEvent;
    } => {
      const nearestEvent = (events: LiquidityEvent[]): LiquidityEvent =>
        last(events.filter(({ block }) => block <= currentBlock));
      return {
        uniswap: nearestEvent(events.uniswap),
        mooniswap: nearestEvent(events.mooniswap),
      };
    };

    const getUserTokensAmount = (
      lastEvents: {
        uniswap: LiquidityEvent;
        mooniswap: LiquidityEvent;
      },
      userEvents: {
        uniswap: LiquidityEvent;
        mooniswap: LiquidityEvent;
      },
    ): BN => {
      const calc = (event: LiquidityEvent, lastPoolEvent: LiquidityEvent) =>
        checkFinite(calcUserTokensAmount(event, lastPoolEvent), new BN(0));
      const uniswapTokens =
        userEvents.uniswap && lastEvents.uniswap
          ? calc(userEvents.uniswap, lastEvents.uniswap)
          : new BN(0);
      const mooniswapTokens =
        userEvents.mooniswap && lastEvents.mooniswap
          ? calc(userEvents.mooniswap, lastEvents.mooniswap)
          : new BN(0);
      return new BN(0).plus(uniswapTokens).plus(mooniswapTokens);
    };

    const getUserGameTime = (
      events: {
        uniswap: LiquidityEvent[];
        mooniswap: LiquidityEvent[];
      },
      gameTime: BN,
      currentBlock: number,
    ): BN => {
      const getNearestToZeroLiqBlock = (
        events: LiquidityEvent[],
        currentBlock: number,
      ): BN => {
        let block = currentBlock;
        for (let event of events.slice().reverse()) {
          if (new BN(event.liquidityTokenBalance).eq(0)) break;
          block = event.block;
        }
        return new BN(block);
      };
      const earlierBlock = BN.min(
        getNearestToZeroLiqBlock(events.uniswap, currentBlock),
        getNearestToZeroLiqBlock(events.mooniswap, currentBlock),
      );
      const userTime = blockDiffTime(earlierBlock, currentBlock);
      return userTime.gte(gameTime) ? gameTime : userTime;
    };

    const getTotalUsersVestingCoef = (
      lastEvents: {
        uniswap: LiquidityEvent;
        mooniswap: LiquidityEvent;
      },
      events: {
        uniswap: LiquidityEvent[];
        mooniswap: LiquidityEvent[];
      },
      gameTime: BN,
      currentBlock: number,
    ) => {
      const uniqueUniswap = uniqueEventsByUser(
        events.uniswap.filter(({ block }) => block <= currentBlock),
      );
      const uniqueMooniswap = uniqueEventsByUser(
        events.mooniswap.filter(({ block }) => block <= currentBlock),
      );
      const allEvents = uniqueEventsByUser([
        ...uniqueUniswap,
        ...uniqueMooniswap,
      ]);
      const users = allEvents.map(event => ({
        uniswap: uniqueUniswap.find(({ user }) => user.id === event.user.id),
        mooniswap: uniqueMooniswap.find(
          ({ user }) => user.id === event.user.id,
        ),
      }));
      return users.reduce((prev, user) => {
        const userTime = getUserGameTime(
          {
            uniswap: user.uniswap ? [user.uniswap] : [],
            mooniswap: user.mooniswap ? [user.mooniswap] : [],
          },
          gameTime,
          currentBlock,
        );
        if (userTime.lte(0)) return prev;
        const userTokensAmount = getUserTokensAmount(lastEvents, user);
        if (userTokensAmount.eq(0)) return prev;

        return prev.plus(Vi(userTime, gameTime).multipliedBy(userTokensAmount));
      }, new BN(0));
    };

    let result = new BN(0);

    const userStartBlock =
      blocks.userStartBlock < blocks.gameStartBlock
        ? blocks.gameStartBlock
        : blocks.userStartBlock;

    for (let i = userStartBlock; i < blocks.ethLatestBlock; i++) {
      const poolLastEvent = getLastEvents(events, i);
      if (!poolLastEvent.uniswap && !poolLastEvent.mooniswap) continue;

      const gameTime = blockDiffTime(blocks.gameStartBlock, i);
      if (gameTime.lte(0)) continue;

      const userEvent = getLastEvents(userLiquidityEvents, i);
      if (!userEvent.uniswap && !userEvent.mooniswap) continue;

      const userTime = getUserGameTime(userLiquidityEvents, gameTime, i);
      if (userTime.lte(0)) continue;

      const userTokensAmount = getUserTokensAmount(poolLastEvent, userEvent);
      if (userTokensAmount.eq(0)) continue;

      const totalUsersVi = getTotalUsersVestingCoef(
        poolLastEvent,
        events,
        gameTime,
        i,
      );
      const liquiditySnapshot: TotalLiquidity = last(
        liquiditySnapshots.filter(({ block }) => block <= i),
      );

      const rm = Rm(
        userTime,
        gameTime,
        new BN(liquiditySnapshot.liquidityUSD),
        userTokensAmount,
        totalUsersVi,
      );

      result = result.plus(rm.isNegative() ? new BN(0) : rm);
    }

    return result;
  }

  private async getUserModel(address: string): Promise<User> {
    const user = await this.databaseService.getUser(address);
    if (user) return user;
    const newUser = await this.databaseService.createUser({
      address,
      lastBlock: 0,
      uniswap: { reward: '0' },
      mooniswap: { reward: '0' },
    });
    newUser.set({ address });
    return newUser;
  }
}
