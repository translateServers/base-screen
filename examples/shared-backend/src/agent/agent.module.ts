import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { ScreensModule } from '../screens/screens.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AssetsModule, ScreensModule, DatasetsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
