import { Module } from '@nestjs/common';
import { DatabaseService, EventName } from './database.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/schemas/user.schema';
import { EventSchema } from 'src/schemas/event.schema';
import { Info, InfoSchema } from 'src/schemas/info.schema';
import { AppConfigModule } from 'src/config/config.module';
import { EthereumModule } from 'src/ethereum/ethereum.module';
import {
  LiquiditySnapshot,
  LiquiditySnapshotSchema,
} from 'src/schemas/snapshot.schema';

@Module({
  imports: [
    AppConfigModule,
    EthereumModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Info.name, schema: InfoSchema }]),
    MongooseModule.forFeature([
      { name: LiquiditySnapshot.name, schema: LiquiditySnapshotSchema },
    ]),
    MongooseModule.forFeature([
      { name: EventName.UniswapXE, schema: EventSchema },
    ]),
    MongooseModule.forFeature([
      { name: EventName.UniswapVE, schema: EventSchema },
    ]),
    MongooseModule.forFeature([
      { name: EventName.UniswapXV, schema: EventSchema },
    ]),
    MongooseModule.forFeature([
      { name: EventName.MooniswapXE, schema: EventSchema },
    ]),
    MongooseModule.forFeature([
      { name: EventName.MooniswapVE, schema: EventSchema },
    ]),
    MongooseModule.forFeature([
      { name: EventName.MooniswapXV, schema: EventSchema },
    ]),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
