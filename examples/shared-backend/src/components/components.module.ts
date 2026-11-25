import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  ComponentDraftsController,
  ComponentFragmentsController,
  ComponentLibraryController,
} from './components.controller';
import { ComponentsService } from './components.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    ComponentDraftsController,
    ComponentFragmentsController,
    ComponentLibraryController,
  ],
  providers: [ComponentsService],
})
export class ComponentsModule {}
