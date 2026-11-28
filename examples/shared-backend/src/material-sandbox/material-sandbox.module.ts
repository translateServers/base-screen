import { Module } from '@nestjs/common';
import { MaterialSandboxController } from './material-sandbox.controller';
import { MaterialSandboxService } from './material-sandbox.service';

@Module({
  controllers: [MaterialSandboxController],
  providers: [MaterialSandboxService],
})
export class MaterialSandboxModule {}
