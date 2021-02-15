import BN from 'bignumber.js';

export enum BLOCKS {
  MINUTE = 5,
  FIVE_MINUTES = BLOCKS.MINUTE * 5,
  THREE_MONTHS = 606462,
}

export const MAX_PSWAP = new BN(4000000);
export const BLOCK_OFFSET = BLOCKS.MINUTE;
