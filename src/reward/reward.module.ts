import { Module } from '@nestjs/common';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';
import { DatabaseModule } from 'src/database/database.module';
import { EthereumModule } from 'src/ethereum/ethereum.module';
import { AppConfigModule } from 'src/config/config.module';
import { PoolsModule } from 'src/pools/pools.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, EthereumModule, PoolsModule],
  providers: [RewardService],
  controllers: [RewardController],
  exports: [RewardService],
})
export class RewardModule {}
