import { Injectable } from '@nestjs/common';
import BN from 'bignumber.js';
import { DatabaseService } from 'src/database/database.service';
import {
  LiquidityEvent,
  PairInfo,
  UserPoolStatistic,
} from 'src/pools/pools.interface';
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
import { BLOCKS } from 'src/consts';

BN.config({ DECIMAL_PLACES: 10 });

const getEventsUpToBlock = (events: LiquidityEvent[], currentBlock: number) => {
  return events.filter(({ block }) => block <= currentBlock);
};

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

const getUsersViCache = (cache: Map<number, BN>, block: number): BN => {
  if (cache.has(block)) {
    return cache.get(block);
  }
  return new BN(-1);
};

const updateUsersViCache = (
  cache: Map<number, BN>,
  block: number,
  value: BN,
): void => {
  if (cache.has(block)) return;
  cache.set(block, value);
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
      formulaUpdateBlock: number;
    },
    pool: {
      uniswap: PoolLiquidityEvents;
      mooniswap: PoolLiquidityEvents;
    },
    liquiditySnapshots: TotalLiquidity[],
    cache: {
      XE: Map<number, BN>;
      XV: Map<number, BN>;
      VE: Map<number, BN>;
    },
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
      blocks.formulaUpdateBlock,
      cache.XE,
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
      blocks.formulaUpdateBlock,
      cache.XV,
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
      blocks.formulaUpdateBlock,
      cache.VE,
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
    const uniswapInfo = await this.poolsService.uniswap.getPairInfoByPair({
      XE: UniswapConfig.XE.address,
      XV: UniswapConfig.XV.address,
      VE: UniswapConfig.VE.address,
    });
    const mooniswapInfo = await this.poolsService.mooniswap.getPairInfoByPair({
      XE: MooniswapConfig.XE.address,
      XV: MooniswapConfig.XV.address,
      VE: MooniswapConfig.VE.address,
    });
    const userUniswap = await this.poolsService.uniswap.getUserStatsByPairs(
      address,
      [
        UniswapConfig.XE.address,
        UniswapConfig.XV.address,
        UniswapConfig.VE.address,
      ],
    );
    const userMooniswap = await this.poolsService.mooniswap.getUserStatsByPairs(
      address,
      [
        MooniswapConfig.XE.address,
        MooniswapConfig.XV.address,
        MooniswapConfig.VE.address,
      ],
    );
    return {
      XE: this.calculateLiquidity(
        {
          uniswap: uniswapInfo.XE,
          mooniswap: mooniswapInfo.XE,
        },
        {
          uniswap: userUniswap[0],
          mooniswap: userMooniswap[0],
        },
      ),
      XV: this.calculateLiquidity(
        {
          uniswap: uniswapInfo.XV,
          mooniswap: mooniswapInfo.XV,
        },
        {
          uniswap: userUniswap[1],
          mooniswap: userMooniswap[1],
        },
      ),
      VE: this.calculateLiquidity(
        {
          uniswap: uniswapInfo.VE,
          mooniswap: mooniswapInfo.VE,
        },
        {
          uniswap: userUniswap[2],
          mooniswap: userMooniswap[2],
        },
      ),
    };
  }

  private calculateLiquidity(
    pair: {
      uniswap: PairInfo;
      mooniswap: PairInfo;
    },
    user: {
      uniswap: UserPoolStatistic;
      mooniswap: UserPoolStatistic;
    },
  ): LiquidityPool {
    const check = (v: BN) => (v.isFinite() ? v : new BN(0));

    if (
      new BN(user.uniswap.liquidityTokenBalance).eq(0) &&
      new BN(user.mooniswap.liquidityTokenBalance).eq(0)
    )
      return { token0: '0', token1: '0', percent: '0' };

    const uniswapPercent = check(
      new BN(user.uniswap.liquidityTokenBalance).div(
        user.uniswap.pair.totalSupply,
      ),
    );
    const mooniswapPercent = check(
      new BN(user.mooniswap.liquidityTokenBalance).div(
        user.mooniswap.pair.totalSupply,
      ),
    );
    const userToken0Amount = new BN(0)
      .plus(uniswapPercent.multipliedBy(user.uniswap.pair.reserve0))
      .plus(mooniswapPercent.multipliedBy(user.mooniswap.pair.reserve0));
    const userToken1Amount = new BN(0)
      .plus(uniswapPercent.multipliedBy(user.uniswap.pair.reserve1))
      .plus(mooniswapPercent.multipliedBy(user.mooniswap.pair.reserve1));

    const totalPairReserve0 = new BN(0)
      .plus(pair.uniswap.reserve0)
      .plus(pair.mooniswap.reserve0);

    const overallPercent = new BN(userToken0Amount).div(totalPairReserve0);

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
    formulaUpdateBlock: number,
    usersViCache: Map<number, BN>,
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
        formulaUpdateBlock,
      },
      liquiditySnapshots,
      userLiquidityEvents,
      events,
      usersViCache,
    );

    return reward;
  }

  private formula(
    blocks: {
      userStartBlock: number;
      gameStartBlock: number;
      ethLatestBlock: number;
      formulaUpdateBlock: number;
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
    usersViCache: Map<number, BN>,
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
      isNewFormulaRequired: boolean,
    ) => {
      const pGameTime = isNewFormulaRequired ? new BN(1) : gameTime;
      const pValue = p(pGameTime, liquidityAmount);
      return new BN(pValue).multipliedBy(
        Vi(userTime, gameTime)
          .multipliedBy(tokensAmount)
          .dividedBy(otherUsersVi),
      );
    };
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
      return {
        uniswap: last(getEventsUpToBlock(events.uniswap, currentBlock)),
        mooniswap: last(getEventsUpToBlock(events.mooniswap, currentBlock)),
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
      const uniswapTokens =
        userEvents.uniswap && lastEvents.uniswap
          ? calcUserTokensAmount(userEvents.uniswap, lastEvents.uniswap)
          : new BN(0);
      const mooniswapTokens =
        userEvents.mooniswap && lastEvents.mooniswap
          ? calcUserTokensAmount(userEvents.mooniswap, lastEvents.mooniswap)
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
        for (const event of events.slice().reverse()) {
          if (new BN(event.liquidityTokenBalance).eq(0)) break;
          block = event.block;
        }
        return new BN(block);
      };
      const earlierBlock = BN.min(
        getNearestToZeroLiqBlock(
          getEventsUpToBlock(events.uniswap, currentBlock),
          currentBlock,
        ),
        getNearestToZeroLiqBlock(
          getEventsUpToBlock(events.mooniswap, currentBlock),
          currentBlock,
        ),
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
      const allUniqueEvents = uniqueEventsByUser([
        ...uniqueUniswap,
        ...uniqueMooniswap,
      ]);
      return allUniqueEvents.reduce((prev, event) => {
        const userLiquidityEvents = {
          uniswap: events.uniswap.filter(
            ({ user }) => user.id === event.user.id,
          ),
          mooniswap: events.mooniswap.filter(
            ({ user }) => user.id === event.user.id,
          ),
        };
        const userLastEvents = getLastEvents(userLiquidityEvents, currentBlock);
        const userTime = getUserGameTime(
          userLiquidityEvents,
          gameTime,
          currentBlock,
        );
        if (userTime.lte(0)) return prev;
        const userTokensAmount = getUserTokensAmount(
          lastEvents,
          userLastEvents,
        );
        if (userTokensAmount.eq(0)) return prev;

        return prev.plus(
          Vi(userTime, gameTime)
            .multipliedBy(userTokensAmount)
            .decimalPlaces(8),
        );
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

      let totalUsersVi = getUsersViCache(usersViCache, i);
      if (totalUsersVi.eq(-1)) {
        totalUsersVi = getTotalUsersVestingCoef(
          poolLastEvent,
          events,
          gameTime,
          i,
        );
        updateUsersViCache(usersViCache, i, totalUsersVi);
      }

      const liquiditySnapshot: TotalLiquidity = last(
        liquiditySnapshots.filter(({ block }) => block <= i),
      );

      const isNewFormulaRequired = blocks.formulaUpdateBlock <= i;
      const rm = Rm(
        userTime,
        gameTime,
        new BN(liquiditySnapshot.liquidityUSD),
        userTokensAmount,
        totalUsersVi,
        isNewFormulaRequired,
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
      reward: '0',
    });
    newUser.set({ address });
    return newUser;
  }
}
