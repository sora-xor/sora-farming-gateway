import { Module } from '@nestjs/common';
import { PoolsModule } from 'src/pools/pools.module';
import { DatabaseModule } from 'src/database/database.module';
import { LoggerModule } from 'src/logger/logger.module';
import { EthereumModule } from 'src/ethereum/ethereum.module';

@Module({
  imports: [LoggerModule, DatabaseModule, PoolsModule, EthereumModule],
})
export class TasksModule {}
