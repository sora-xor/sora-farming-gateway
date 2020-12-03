import { Test, TestingModule } from '@nestjs/testing';
import { PoolsService } from './pools.service';

describe('PoolsService', () => {
  let service: PoolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PoolsService],
    }).compile();

    service = module.get<PoolsService>(PoolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
