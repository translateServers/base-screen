import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AgentCandidateResult,
  type AgentComponentEditResult,
  type AgentGenerateResult,
  AgentService,
} from './agent.service';
import { AgentCandidateDto } from './dto/agent-candidate.dto';
import { AgentComponentEditDto } from './dto/agent-component-edit.dto';
import { AgentGenerateDto } from './dto/agent-generate.dto';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('candidate')
  @ApiOperation({ summary: '生成整屏候选文档，不创建或更新大屏' })
  async candidate(@Body() dto: AgentCandidateDto): Promise<AgentCandidateResult> {
    return this.agent.generateCandidate({
      topic: dto.topic,
      ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
      ...(dto.references === undefined ? {} : { references: dto.references }),
    });
  }

  @Post('edit')
  @ApiOperation({ summary: '为选中组件生成候选修改 patch，不写入文档' })
  async edit(@Body() dto: AgentComponentEditDto): Promise<AgentComponentEditResult> {
    return this.agent.editComponents({
      instruction: dto.instruction,
      components: dto.components,
    });
  }

  @Post('generate')
  @ApiOperation({ summary: '让示例智能体生成一屏并落库；失败时退回确定性结构并如实标注' })
  async generate(@Body() dto: AgentGenerateDto): Promise<AgentGenerateResult> {
    return this.agent.generate({
      topic: dto.topic,
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
    });
  }
}
