import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  type AgentActResult,
  type AgentCandidateResult,
  type AgentComponentEditResult,
  type AgentGenerateResult,
  AgentService,
} from './agent.service';
import { AgentActDto } from './dto/agent-act.dto';
import { AgentCandidateDto } from './dto/agent-candidate.dto';
import { AgentComponentEditDto } from './dto/agent-component-edit.dto';
import { AgentGenerateDto } from './dto/agent-generate.dto';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('act')
  @ApiOperation({ summary: '把一句话路由成动作并执行：生成整屏 / 改组件 / 改画布 / 明确不支持' })
  async act(@Body() dto: AgentActDto, @Req() request?: Request): Promise<AgentActResult> {
    return this.agent.act({
      signal: clientSignal(request),
      text: dto.text,
      scope: dto.scope,
      ...(dto.componentIds === undefined ? {} : { componentIds: dto.componentIds }),
      ...(dto.components === undefined ? {} : { components: dto.components }),
      ...(dto.screenId === undefined ? {} : { screenId: dto.screenId }),
      ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
      ...(dto.references === undefined ? {} : { references: dto.references }),
      ...(dto.canvas === undefined ? {} : { canvas: dto.canvas }),
      ...(dto.context === undefined ? {} : { context: dto.context }),
    });
  }
  @Post('candidate')
  @ApiOperation({ summary: '生成整屏候选文档，不创建或更新大屏' })
  async candidate(
    @Body() dto: AgentCandidateDto,
    @Req() request?: Request,
  ): Promise<AgentCandidateResult> {
    return this.agent.generateCandidate({
      signal: clientSignal(request),
      topic: dto.topic,
      screenId: dto.screenId,
      ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
      ...(dto.references === undefined ? {} : { references: dto.references }),
    });
  }

  @Post('edit')
  @ApiOperation({ summary: '为选中组件生成候选修改 patch，不写入文档' })
  async edit(
    @Body() dto: AgentComponentEditDto,
    @Req() request?: Request,
  ): Promise<AgentComponentEditResult> {
    return this.agent.editComponents({
      signal: clientSignal(request),
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

/**
 * 前端断开即中止上游模型请求（ADR-0112 §2.6）：宿主取消时会 abort 自己的 fetch，连接随之关闭。
 * 看响应的 `close` 而不是请求的：Node 16 起请求体读完就会触发请求的 `close`，那不是断开。
 */
function clientSignal(request: Request | undefined): AbortSignal {
  const controller = new AbortController();
  const response = request?.res;
  response?.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  return controller.signal;
}
