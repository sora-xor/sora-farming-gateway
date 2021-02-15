export interface LiquidityEvent {
  block: number;
  user: { id: string };
  token0PriceUSD: string;
  token1PriceUSD: string;
  liquidityTokenBalance: string;
  liquidityTokenTotalSupply: string;
  reserveUSD: string;
  reserve0: string;
  reserve1: string;
  pair: {
    token0: {
      symbol: string;
    };
    token1: {
      symbol: string;
    };
  };
}

export interface MultiplePairInfo {
  XE: PairInfo;
  XV: PairInfo;
  VE: PairInfo;
}

export interface PairInfo {
  reserve0: string;
  reserve1: string;
  reserveUSD: string;
  token0: {
    symbol: string;
  };
  token1: {
    symbol: string;
  };
}

export interface PairReserve {
  reserveUSD: string;
}

export interface MultiplePairReserve {
  XE: PairReserve;
  XV: PairReserve;
  VE: PairReserve;
}

export interface UserPoolStatistic {
  id: string;
  liquidityTokenBalance: string;
  pair: {
    totalSupply: string;
    reserve0: string;
    reserve1: string;
    token0: {
      symbol: string;
    };
    token1: {
      symbol: string;
    };
  };
}
