import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/schemas/user.schema';
import { Event } from 'src/schemas/event.schema';
import { Model } from 'mongoose';
import { LiquidityEvent } from 'src/pools/pools.interface';
import { Info } from 'src/schemas/info.schema';
import { AppConfigService } from 'src/config/config.service';
import { EthereumService } from 'src/ethereum/ethereum.service';
import { LiquiditySnapshot } from 'src/schemas/snapshot.schema';

interface InfoDTO {
  pswap: string;
  startBlock: number;
  lastBlock: number;
  formulaUpdateBlock: number;
  lastUpdateTimestamp: string;
}

interface LiquiditySnapshotDTO {
  block: number;
  liquidityUSD: string;
}

export interface UserDTO {
  address: string;
  lastBlock: number;
  reward: string;
}

export enum EventName {
  UniswapXE = 'UniswapXE',
  UniswapVE = 'UniswapVE',
  UniswapXV = 'UniswapXV',
  MooniswapXE = 'MooniswapXE',
  MooniswapVE = 'MooniswapVE',
  MooniswapXV = 'MooniswapXV',
}

class EventChain {
  constructor(private event: Model<Event>) {}

  async createEvents(events: LiquidityEvent[]): Promise<Event[]> {
    return this.event.insertMany(events);
  }

  async getEvents(): Promise<LiquidityEvent[]> {
    return this.event.find().lean();
  }

  async getEventsByAddress(address: string): Promise<LiquidityEvent[]> {
    return this.event.find({ user: { id: address } }).lean();
  }

  async getUsersAddress(): Promise<string[]> {
    return this.event.distinct('user.id');
  }
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly ethereumService: EthereumService,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Info.name) private infoModel: Model<Info>,
    @InjectModel(LiquiditySnapshot.name)
    private liquiditySnapshotModel: Model<LiquiditySnapshot>,
    @InjectModel(EventName.UniswapXE)
    private uniswapXEModel: Model<Event>,
    @InjectModel(EventName.UniswapVE)
    private uniswapVEModel: Model<Event>,
    @InjectModel(EventName.UniswapXV)
    private uniswapXVModel: Model<Event>,
    @InjectModel(EventName.MooniswapXE)
    private mooniswapXEModel: Model<Event>,
    @InjectModel(EventName.MooniswapVE)
    private mooniswapVEModel: Model<Event>,
    @InjectModel(EventName.MooniswapXV)
    private mooniswapXVModel: Model<Event>,
  ) {}

  async onModuleInit() {
    const info = await this.getInfo();
    if (!info) {
      const startBlock =
        this.appConfigService.ethereumStartBlock === -1
          ? await this.ethereumService.getLastBlock()
          : this.appConfigService.ethereumStartBlock;
      await this.createInfo({
        pswap: '0',
        startBlock,
        lastBlock: startBlock,
        formulaUpdateBlock: this.appConfigService.ethereumFormulaUpdateBlock,
        lastUpdateTimestamp: new Date().toISOString(),
      });
    }
  }

  getEventPool(event: string): EventChain {
    const eventList = {
      [EventName.UniswapXE]: new EventChain(this.uniswapXEModel),
      [EventName.UniswapVE]: new EventChain(this.uniswapVEModel),
      [EventName.UniswapXV]: new EventChain(this.uniswapXVModel),
      [EventName.MooniswapXE]: new EventChain(this.mooniswapXEModel),
      [EventName.MooniswapVE]: new EventChain(this.mooniswapVEModel),
      [EventName.MooniswapXV]: new EventChain(this.mooniswapXVModel),
    };
    return eventList[event];
  }

  async createUser(createUserDTO: UserDTO): Promise<User> {
    return new this.userModel(createUserDTO).save();
  }

  async getUser(address: string): Promise<User> {
    return this.userModel.findOne({ address });
  }

  async updateUser(user: User): Promise<User> {
    return user.save();
  }

  async createInfo(createInfoDTO: InfoDTO): Promise<Info> {
    return new this.infoModel(createInfoDTO).save();
  }

  async getInfo(): Promise<Info> {
    return this.infoModel.findOne();
  }

  async updateInfo(info: Info): Promise<Info> {
    return info.save();
  }

  async createLiquiditySnapshot(
    createSnapshotDTO: LiquiditySnapshotDTO,
  ): Promise<LiquiditySnapshot> {
    return new this.liquiditySnapshotModel(createSnapshotDTO).save();
  }

  async getLiquiditySnapshot(): Promise<LiquiditySnapshot[]> {
    return this.liquiditySnapshotModel.find().lean();
  }
}
