import { LiquidityEvent } from 'src/pools/pools.interface';

export interface LiquidityPool {
  token0: string;
  token1: string;
  percent: string;
}

export interface Liquidity {
  XE: LiquidityPool;
  XV: LiquidityPool;
  VE: LiquidityPool;
}

export interface PoolLiquidityEvents {
  XE: LiquidityEvent[];
  XV: LiquidityEvent[];
  VE: LiquidityEvent[];
}

export interface TotalLiquidity {
  block: number;
  liquidityUSD: string;
}
