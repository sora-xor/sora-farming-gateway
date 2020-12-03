import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigModule } from 'src/config/config.module';
import { AppConfigService } from 'src/config/config.service';
import { DatabaseModule } from 'src/database/database.module';
import { EthereumModule } from 'src/ethereum/ethereum.module';
import { LoggerModule } from 'src/logger/logger.module';
import { RewardModule } from 'src/reward/reward.module';
import { ChildService } from './child.service';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    MongooseModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: async (configService: AppConfigService) => ({
        uri: configService.database,
        useFindAndModify: false,
      }),
      inject: [AppConfigService],
    }),
    EthereumModule,
    RewardModule,
  ],
  providers: [ChildService],
})
export class ChildModule {}
