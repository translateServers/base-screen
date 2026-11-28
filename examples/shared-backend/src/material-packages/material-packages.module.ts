import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialAttestationService } from './material-attestation.service';
import { MaterialPackagesController } from './material-packages.controller';
import { MaterialPackagesService } from './material-packages.service';

@Module({
  imports: [PrismaModule],
  controllers: [MaterialPackagesController],
  providers: [MaterialPackagesService, MaterialAttestationService],
  exports: [MaterialPackagesService, MaterialAttestationService],
})
export class MaterialPackagesModule {}
