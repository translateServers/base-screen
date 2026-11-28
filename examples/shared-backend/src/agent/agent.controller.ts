import { Body, Controller, HttpException, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  type AgentActInput,
  type AgentActResult,
  type AgentComponentEditResult,
  type AgentGenerateResult,
  type AgentIntentResult,
  type AgentMaterialDraftResult,
  AgentService,
} from './agent.service';
import { AgentActDto } from './dto/agent-act.dto';
import { AgentCandidateDto } from './dto/agent-candidate.dto';
import { AgentComponentEditDto } from './dto/agent-component-edit.dto';
import { AgentGenerateDto } from './dto/agent-generate.dto';
import { AgentMaterialIsolatedDto } from './dto/agent-material-isolated.dto';
import { AgentMaterialDto } from './dto/agent-material.dto';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger('AgentController');

  constructor(private readonly agent: AgentService) {}

  @Post('act')
  @ApiOperation({ summary: '把一句话路由成动作并执行：生成整屏 / 改组件 / 改画布 / 明确不支持' })
  async act(@Body() dto: AgentActDto, @Req() request?: Request): Promise<AgentActResult> {
    return this.agent.act(actInput(dto, clientSignal(request)));
  }

  /**
   * 同 `act`，结果用 SSE 推送（ADR-0112 §2.5 / ADR-0113 §2.8）。整屏生成时先推 `status`
   * （`thinking`：模型推理中，不展示推理内容；`writing`：开始写正文），骨架写齐推 `skeleton`
   * （标题、副标题、风格、版面骨架），之后每写完一个指标或块推一条 `item`（位置路径 + 值），
   * 最后推 `result`（与 `act` 的响应体相同，带模型原文）；失败推 `error`（状态码与错误体）。
   * 编译与审计在宿主前端做。入参校验失败发生在进入流之前，仍按普通 JSON 错误返回。
   */
  @Post('act/stream')
  @ApiOperation({ summary: '同 act，按 SSE 推送骨架与逐块进度，最后推送完整结果' })
  async actStream(
    @Body() dto: AgentActDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const signal = clientSignal(request);
    response.status(200);
    response.setHeader('content-type', 'text/event-stream; charset=utf-8');
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.setHeader('x-accel-buffering', 'no');
    response.flushHeaders();
    const send = (event: string, data: unknown) => {
      if (response.writableEnded) return;
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const result = await this.agent.act({
        ...actInput(dto, signal),
        onEvent: ({ type, ...payload }) => send(type, payload),
      });
      send('result', result);
    } catch (error) {
      send('error', streamError(error, this.logger));
    } finally {
      response.end();
    }
  }

  @Post('candidate')
  @ApiOperation({
    summary: '生成整屏意图（模型原文），不创建或更新大屏；带 repair 时返回修复后的整份原文',
  })
  async candidate(
    @Body() dto: AgentCandidateDto,
    @Req() request?: Request,
  ): Promise<AgentIntentResult> {
    return this.agent.generateIntent({
      signal: clientSignal(request),
      topic: dto.topic,
      screenId: dto.screenId,
      ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
      ...(dto.references === undefined ? {} : { references: dto.references }),
      ...(dto.repair === undefined ? {} : { repair: dto.repair }),
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

  /**
   * 组件工坊「让智能体起草」（ADR-0116 D7）：返回模型原文（一份 L2 模板物料规格）。
   * 解析与体检在宿主前端做；带 `repair` 时把上一轮原文与体检结论交给模型修复。不写任何东西。
   */
  @Post('material')
  @ApiOperation({
    summary: '起草一个 L2 模板物料规格（模型原文），不保存；带 repair 时返回修复后的整份原文',
  })
  async material(
    @Body() dto: AgentMaterialDto,
    @Req() request?: Request,
  ): Promise<AgentMaterialDraftResult> {
    return this.agent.draftMaterial({
      signal: clientSignal(request),
      instruction: dto.instruction,
      ...(dto.repair === undefined ? {} : { repair: dto.repair }),
    });
  }

  /**
   * 组件工坊「代码组件（隔离）」的「让智能体起草」（ADR-0117 D12）：返回模型原文（一份 L3 规格 + 代码）。
   * 解析、体检、代码词法检查与沙箱试运行都在宿主前端做；带 `repair` 时把上一轮原文交给模型修复。
   */
  @Post('material-isolated')
  @ApiOperation({
    summary: '起草一个 L3 隔离代码物料（模型原文：规格 + 代码），不保存；带 repair 时返回修复后的整份原文',
  })
  async materialIsolated(
    @Body() dto: AgentMaterialIsolatedDto,
    @Req() request?: Request,
  ): Promise<AgentMaterialDraftResult> {
    return this.agent.draftIsolatedMaterial({
      signal: clientSignal(request),
      instruction: dto.instruction,
      ...(dto.repair === undefined ? {} : { repair: dto.repair }),
    });
  }

  @Post('generate')
  @ApiOperation({
    summary:
      '让示例智能体生成一屏并落库；未配置模型时退回确定性结构并如实标注，模型调用失败时报错、不落库',
  })
  async generate(@Body() dto: AgentGenerateDto): Promise<AgentGenerateResult> {
    return this.agent.generate({
      topic: dto.topic,
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
    });
  }
}

function actInput(dto: AgentActDto, signal: AbortSignal): AgentActInput {
  return {
    signal,
    text: dto.text,
    scope: dto.scope,
    ...(dto.componentIds === undefined ? {} : { componentIds: dto.componentIds }),
    ...(dto.components === undefined ? {} : { components: dto.components }),
    ...(dto.screenId === undefined ? {} : { screenId: dto.screenId }),
    ...(dto.catalog === undefined ? {} : { catalog: dto.catalog }),
    ...(dto.references === undefined ? {} : { references: dto.references }),
    ...(dto.canvas === undefined ? {} : { canvas: dto.canvas }),
    ...(dto.context === undefined ? {} : { context: dto.context }),
    ...(dto.session === undefined ? {} : { session: dto.session }),
  };
}

/**
 * 流里的错误：与普通请求的错误体同形（`error` + `message` + 附加字段），另带 `status`，
 * 宿主按同一套规则读。非业务异常不外泄细节。
 */
function streamError(error: unknown, logger: Logger): Record<string, unknown> {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    return typeof body === 'object' && body !== null
      ? { status: error.getStatus(), ...(body as Record<string, unknown>) }
      : { status: error.getStatus(), error: `HTTP_${error.getStatus()}`, message: String(body) };
  }
  logger.error(`agent stream failed: ${error instanceof Error ? error.name : 'unknown'}`);
  return { status: 500, error: 'INTERNAL_ERROR', message: '服务内部错误。' };
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
