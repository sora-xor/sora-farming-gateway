import { Injectable } from '@nestjs/common';
import Web3 from 'web3';
import { AppConfigService } from 'src/config/config.service';

@Injectable()
export class EthereumService {
  private web3Instance: Web3;

  constructor(private readonly appConfigService: AppConfigService) {
    this.web3Instance = new Web3(
      new Web3.providers.HttpProvider(this.appConfigService.ethereumNode),
    );
  }

  async getLastBlock(): Promise<number> {
    const blockInfo = await this.web3Instance.eth.getBlock('latest');
    return blockInfo.number;
  }

  checkAddress(address: string): boolean {
    return this.web3Instance.utils.isAddress(address);
  }
}
