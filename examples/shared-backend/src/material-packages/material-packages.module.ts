import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialPackagesController } from './material-packages.controller';
import { MaterialPackagesService } from './material-packages.service';

@Module({
  imports: [PrismaModule],
  controllers: [MaterialPackagesController],
  providers: [MaterialPackagesService],
  exports: [MaterialPackagesService],
})
export class MaterialPackagesModule {}
