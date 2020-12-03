import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { EthereumModule } from 'src/ethereum/ethereum.module';
import { PoolsModule } from 'src/pools/pools.module';
import { RewardModule } from 'src/reward/reward.module';
import { DatabaseModule } from 'src/database/database.module';
import { AppConfigModule } from 'src/config/config.module';
import { AppConfigService } from 'src/config/config.service';
import { AppController } from 'src/app/app.controller';
import { TasksService } from 'src/tasks/tasks.service';
import { TasksModule } from 'src/tasks/tasks.module';
import { LoggerModule } from 'src/logger/logger.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    EthereumModule,
    PoolsModule,
    RewardModule,
    DatabaseModule,
    TasksModule,
    MongooseModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: async (configService: AppConfigService) => ({
        uri: configService.database,
        useFindAndModify: false,
      }),
      inject: [AppConfigService],
    }),
    ScheduleModule.forRoot(),
  ],
  providers: [TasksService],
  controllers: [AppController],
})
export class AppModule {}
