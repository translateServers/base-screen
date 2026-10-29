import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentService, type AgentGenerateResult } from './agent.service';
import { AgentGenerateDto } from './dto/agent-generate.dto';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('generate')
  @ApiOperation({ summary: '让示例智能体生成一屏并落库；失败时退回确定性结构并如实标注' })
  async generate(@Body() dto: AgentGenerateDto): Promise<AgentGenerateResult> {
    return this.agent.generate({ topic: dto.topic, ...(dto.name === undefined ? {} : { name: dto.name }) });
  }
}
