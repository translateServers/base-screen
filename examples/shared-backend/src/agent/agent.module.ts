import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { ScreensModule } from '../screens/screens.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [ScreensModule, DatasetsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
