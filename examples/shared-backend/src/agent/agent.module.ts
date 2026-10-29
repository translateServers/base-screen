import { Module } from '@nestjs/common';
import { ScreensModule } from '../screens/screens.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [ScreensModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
