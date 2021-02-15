import { Injectable } from '@nestjs/common';
import tag from 'graphql-tag';
import ApolloClient from 'apollo-client';
import fetch from 'node-fetch';
import * as ApolloLink from 'apollo-link-http';
import * as Cache from 'apollo-cache-inmemory';
import { DocumentNode } from 'graphql';
import {
  LiquidityEvent,
  MultiplePairInfo,
  MultiplePairReserve,
  PairInfo,
  UserPoolStatistic,
} from './pools.interface';
import { BLOCKS } from 'src/consts';
import userList from '../users.json';

enum Tokens {
  XOR = 'XOR',
  VAL = 'VAL',
  ETH = 'ETH',
  WETH = 'WETH',
}

export const UniswapConfig = {
  URL: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
  XE: { address: '0x01962144d41415cca072900fe87bbe2992a99f10' },
  XV: { address: '0x4fd3f9811224bf5a87bbaf002a345560c2d98d76' },
  VE: { address: '0x64c9cfa988bbe7b2df671af345bcf8fa904cebb8' },
};

export const MooniswapConfig = {
  URL: 'https://api.thegraph.com/subgraphs/name/krboktv/mooniswap',
  XE: { address: '0xb90d8c0c2ace705fad8ad7e447dcf3e858c20448' },
  XV: { address: '0x215470102a05b02a3a2898f317b5382f380afc0e' },
  VE: { address: '0xdd9354112cd8e0b4b5e8823cb0701b2ea19c19e4' },
};

function swapInfoTokenOrder(info: PairInfo): PairInfo {
  const _swap = (i: PairInfo): PairInfo => {
    return {
      ...i,
      reserve0: i.reserve1,
      reserve1: i.reserve0,
      token0: i.token1,
      token1: i.token0,
    };
  };
  if (info.token0.symbol === Tokens.ETH || info.token0.symbol === Tokens.WETH) {
    return _swap(info);
  } else if (
    info.token0.symbol === Tokens.VAL &&
    info.token1.symbol === Tokens.XOR
  ) {
    return _swap(info);
  }
  return info;
}

function swapEventsTokenOrder(events: LiquidityEvent[]): LiquidityEvent[] {
  const _swap = (e: LiquidityEvent): LiquidityEvent => ({
    ...e,
    pair: {
      token0: e.pair.token1,
      token1: e.pair.token0,
    },
    token0PriceUSD: e.token1PriceUSD,
    token1PriceUSD: e.token0PriceUSD,
    reserve0: e.reserve1,
    reserve1: e.reserve0,
  });
  return events.map((e: LiquidityEvent) => {
    if (
      e.pair.token0.symbol === Tokens.ETH ||
      e.pair.token0.symbol === Tokens.WETH
    ) {
      return _swap(e);
    } else if (
      e.pair.token0.symbol === Tokens.VAL &&
      e.pair.token1.symbol === Tokens.XOR
    ) {
      return _swap(e);
    }
    return e;
  });
}

function swapStatsTokenOrder(stats: UserPoolStatistic[]): UserPoolStatistic[] {
  const _swap = (s: UserPoolStatistic): UserPoolStatistic => {
    return {
      ...s,
      pair: {
        ...s.pair,
        reserve0: s.pair.reserve1,
        reserve1: s.pair.reserve0,
        token0: s.pair.token1,
        token1: s.pair.token0,
      },
    };
  };
  return stats.map((s: UserPoolStatistic) => {
    if (
      s.pair.token0.symbol === Tokens.ETH ||
      s.pair.token0.symbol === Tokens.WETH
    ) {
      return _swap(s);
    } else if (
      s.pair.token0.symbol === Tokens.VAL &&
      s.pair.token1.symbol === Tokens.XOR
    ) {
      return _swap(s);
    }
    return s;
  });
}

function generateQuery(firstBlock: number, lastBlock: number) {
  // Suppose to make query each 20 blocks
  const step = BLOCKS.FIVE_MINUTES - 5;
  const len = Math.floor((lastBlock - firstBlock) / step);
  const arrayOfBlocks = new Array(len)
    .fill(firstBlock)
    .map((_, i) => firstBlock + i * step);
  const arrayOfQueries = arrayOfBlocks.map(blockNum => {
    return `
      XE${blockNum}: pair (id: $XE, block: { number: ${blockNum} }) {
        reserveUSD
      },
      XV${blockNum}: pair (id: $XV, block: { number: ${blockNum} }) {
        reserveUSD
      },
      VE${blockNum}: pair (id: $VE, block: { number: ${blockNum} }) {
        reserveUSD
      }
    `;
  });
  return tag(`query Pair($XE: String!, $XV: String!, $VE: String!) {
    ${arrayOfQueries.join()}
  }`);
}

class Query {
  private queryLiquidityPositionSnapshots = tag(
    `query LiquidityPositionSnapshots($pairAddress: String!, $skip: Int!, $first: Int!) {
      liquidityPositionSnapshots(
        where:{
          pair: $pairAddress
        }
        orderBy: block
        skip: $skip
        first: $first
      ) {
        block
        user {
          id
        }
        pair {
          token0 {
            symbol
          }
          token1 {
            symbol
          }
        }
        token0PriceUSD
        token1PriceUSD
        liquidityTokenBalance
        liquidityTokenTotalSupply
        reserveUSD
        reserve0
        reserve1
      }
    }`,
  );
  private queryPair = tag(
    `query Pair($XE: String!, $XV: String!, $VE: String!) {
      XE: pair (
        id: $XE
      ) {
        reserve0
        reserve1
        reserveUSD
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      XV: pair (
        id: $XV
      ) {
        reserve0
        reserve1
        reserveUSD
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      VE: pair (
        id: $VE
      ) {
        reserve0
        reserve1
        reserveUSD
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
    }`,
  );
  private queryPairReserve = tag(
    `query Pair($XE: String!, $XV: String!, $VE: String!, $block: Int!) {
      XE: pair (id: $XE, block: { number: $block }) {
        reserveUSD
      },
      XV: pair (id: $XV, block: { number: $block }) {
        reserveUSD
      },
      VE: pair (id: $VE, block: { number: $block }) {
        reserveUSD
      }
    }`,
  );
  private queryUserStats = tag(
    `query User($userAddress: String!, $pairAddreses: [String!]) {
      user (id: $userAddress) {
        liquidityPositions (
          where: { pair_in: $pairAddreses }
        ) {
          id
          liquidityTokenBalance
          pair {
            totalSupply
            reserve0
            reserve1
            token0 {
              symbol
            }
            token1 {
              symbol
            }
          }
        }
      }
    }`,
  );
  constructor(private readonly client: ApolloClient<any>) {}

  async getLiquidityEventsByPair(
    skip: number,
    pairAddress: string,
  ): Promise<LiquidityEvent[]> {
    return swapEventsTokenOrder(
      await this.getLiquidityEvents(this.queryLiquidityPositionSnapshots, {
        pairAddress,
        skip,
        first: 1000,
      }),
    );
  }

  async getPairInfoByPair(addresses: {
    XE: string;
    XV: string;
    VE: string;
  }): Promise<MultiplePairInfo> {
    const response = await this.getPairInfo(this.queryPair, {
      XE: addresses.XE,
      XV: addresses.XV,
      VE: addresses.VE,
    });
    return {
      XE: swapInfoTokenOrder(response.XE),
      XV: swapInfoTokenOrder(response.XV),
      VE: swapInfoTokenOrder(response.VE),
    };
  }

  async getPairReserveByPair(
    addresses: {
      XE: string;
      XV: string;
      VE: string;
    },
    block: number,
  ): Promise<MultiplePairReserve> {
    return this.getPairReserve(this.queryPairReserve, {
      XE: addresses.XE,
      XV: addresses.XV,
      VE: addresses.VE,
      block,
    });
  }

  async getPairReserveByPairInRange(
    addresses: {
      XE: string;
      XV: string;
      VE: string;
    },
    block: {
      firstBlock: number;
      lastBlock: number;
    },
  ) {
    return this.getPairReserveInRange(block, addresses);
  }

  async getUserStatsByPairs(
    userAddress: string,
    pairAddreses: string[],
  ): Promise<UserPoolStatistic[]> {
    return swapStatsTokenOrder(
      await this.getUserStats(this.queryUserStats, {
        userAddress,
        pairAddreses,
      }),
    );
  }

  private async getLiquidityEvents(
    query: DocumentNode,
    variables: { pairAddress: string; skip: number; first: number },
  ): Promise<LiquidityEvent[]> {
    try {
      let allEvents: LiquidityEvent[] = [];
      let lastResponseLen = 0;
      const { data } = await this.client.query({ query, variables });

      allEvents = allEvents.concat(data.liquidityPositionSnapshots);
      lastResponseLen = data.liquidityPositionSnapshots.length;

      while (lastResponseLen === 1000) {
        variables.skip += 1000;
        const { data } = await this.client.query({
          query,
          variables: {
            ...variables,
            skip: variables.skip,
          },
        });
        allEvents = allEvents.concat(data.liquidityPositionSnapshots);
        lastResponseLen = data.liquidityPositionSnapshots.length;
      }

      return allEvents;
    } catch (error) {
      console.error(error);
    }
  }

  private async getPairInfo(
    query: DocumentNode,
    variables: { XE: string; XV: string; VE: string },
  ): Promise<MultiplePairInfo> {
    try {
      const { data } = await this.client.query({ query, variables });
      return data;
    } catch (error) {
      console.error(error);
    }
  }

  private async getPairReserve(
    query: DocumentNode,
    variables: { XE: string; XV: string; VE: string; block: number },
  ): Promise<MultiplePairReserve> {
    try {
      const { data } = await this.client.query({ query, variables });
      return data;
    } catch (error) {
      console.error(error);
    }
  }

  private async getPairReserveInRange(
    block: { firstBlock: number; lastBlock: number },
    variables: { XE: string; XV: string; VE: string },
  ): Promise<MultiplePairReserve> {
    const query = generateQuery(block.firstBlock, block.lastBlock);
    try {
      const { data } = await this.client.query({ query, variables });
      return data;
    } catch (error) {
      console.error(error);
    }
  }

  private async getUserStats(
    query: DocumentNode,
    variables: { userAddress: string; pairAddreses: string[] },
  ): Promise<UserPoolStatistic[]> {
    const mock = {
      id: '',
      liquidityTokenBalance: '0',
      pair: {
        totalSupply: '0',
        reserve0: '0',
        reserve1: '0',
        token0: { symbol: '' },
        token1: { symbol: '' },
      },
    };
    try {
      const { data } = await this.client.query({ query, variables });

      if (!data.user) return [mock, mock, mock];
      if (!data.user.liquidityPositions.length) return [mock, mock, mock];

      const pairs = variables.pairAddreses;

      return [
        data.user.liquidityPositions.find(({ id }) => id.includes(pairs[0])) ||
          mock,
        data.user.liquidityPositions.find(({ id }) => id.includes(pairs[1])) ||
          mock,
        data.user.liquidityPositions.find(({ id }) => id.includes(pairs[2])) ||
          mock,
      ];
    } catch (error) {
      console.error(error);
    }
  }
}

@Injectable()
export class PoolsService {
  private uniswapClient: ApolloClient<any>;
  private mooniswapClient: ApolloClient<any>;

  constructor() {
    this.uniswapClient = new ApolloClient({
      link: ApolloLink.createHttpLink({
        uri: UniswapConfig.URL,
        fetch,
      }),
      cache: new Cache.InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'no-cache',
          errorPolicy: 'ignore',
        },
        query: {
          fetchPolicy: 'no-cache',
          errorPolicy: 'all',
        },
      },
    });
    this.mooniswapClient = new ApolloClient({
      link: ApolloLink.createHttpLink({
        uri: MooniswapConfig.URL,
        fetch,
      }),
      cache: new Cache.InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'no-cache',
          errorPolicy: 'ignore',
        },
        query: {
          fetchPolicy: 'no-cache',
          errorPolicy: 'all',
        },
      },
    });
  }

  get uniswap() {
    return new Query(this.uniswapClient);
  }

  get mooniswap() {
    return new Query(this.mooniswapClient);
  }
}

@Injectable()
export class MockPoolsService {
  uniswapLastBlock = 10850000;
  mooniswapLastBlock = 10850000;

  uniswapDone = false;
  mooniswapDone = false;

  users = userList;

  generateUserEvent(block: number, address: string) {
    return {
      block,
      user: {
        id: address,
      },
      token0PriceUSD: '10',
      liquidityTokenBalance: '1000',
      liquidityTokenTotalSupply: '1000',
      reserveUSD: '1000000',
      reserve0: '10000',
      reserve1: '10000',
    };
  }

  get uniswap() {
    const getLiquidityEventsByPair = () => {
      if (this.uniswapDone) return [];
      this.uniswapDone = true;
      return this.users.reduce((prev, address) => {
        this.uniswapLastBlock += 1;
        return [
          ...prev,
          this.generateUserEvent(this.uniswapLastBlock, address),
        ];
      }, []);
    };
    return {
      getLiquidityEventsByPair,
    };
  }

  get mooniswap() {
    const getLiquidityEventsByPair = () => {
      if (this.mooniswapDone) return [];
      this.mooniswapDone = true;
      return this.users.reduce((prev, address) => {
        this.mooniswapLastBlock += 1;
        return [
          ...prev,
          this.generateUserEvent(this.mooniswapLastBlock, address),
        ];
      }, []);
    };
    return {
      getLiquidityEventsByPair,
    };
  }
}
