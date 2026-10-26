import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { ScreensController } from './screens.controller';
import { ScreensService } from './screens.service';

@Module({
  imports: [AssetsModule],
  controllers: [ScreensController],
  providers: [ScreensService],
  exports: [ScreensService],
})
export class ScreensModule {}
