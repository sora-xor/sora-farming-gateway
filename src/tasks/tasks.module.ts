import { Module } from '@nestjs/common';
import { PoolsModule } from 'src/pools/pools.module';
import { DatabaseModule } from 'src/database/database.module';
import { LoggerModule } from 'src/logger/logger.module';

@Module({
  imports: [LoggerModule, DatabaseModule, PoolsModule],
})
export class TasksModule {}
