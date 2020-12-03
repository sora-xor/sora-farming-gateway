import { Controller, Get, Param, HttpException } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { EthereumService } from 'src/ethereum/ethereum.service';
import { RewardService } from './reward.service';

@Controller('reward')
export class RewardController {
  constructor(
    private readonly ethereumService: EthereumService,
    private readonly rewardService: RewardService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get(':address')
  async getReward(@Param('address') address: string): Promise<any> {
    const _address = address.toLowerCase();
    if (!this.ethereumService.checkAddress(_address)) {
      throw new HttpException(
        {
          error: {
            message: 'Invalid ethereum address.',
            params: {
              address: _address,
            },
          },
        },
        400,
      );
    }

    const user = await this.databaseService.getUser(_address);

    if (!user) {
      throw new HttpException(
        {
          error: {
            message: 'User with this address is not found.',
            params: {
              address: _address,
            },
          },
        },
        404,
      );
    }

    const liquidity = await this.rewardService.getLiquidityByAddress(_address);

    return {
      timestamp: Date.now(),
      user,
      liquidity,
    };
  }
}
