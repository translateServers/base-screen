import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetSeedService } from './asset-seed.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetSeedService],
  exports: [AssetsService],
})
export class AssetsModule {}
