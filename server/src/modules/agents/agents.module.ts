import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}