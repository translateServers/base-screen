import { Body, Controller, Get, Head, HttpCode, Param, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PutMaterialSandboxDocumentDto } from './dto/material-sandbox.dto';
import { BASE_SCREEN_ISOLATED_SANDBOX_HEADERS } from './material-isolated-csp';
import { MaterialSandboxService } from './material-sandbox.service';

/**
 * L3 沙箱路由（base-screen-docs ADR-0118）：按内容哈希寻址，`GET`/`HEAD` 没有宿主登录态与任何
 * 鉴权要求（沙箱文档本身不含机密，哈希即内容）；`PUT` 幂等，客户端先 `HEAD` 探一次再决定要不要传。
 */
@ApiTags('material-sandbox')
@Controller('material-sandbox')
export class MaterialSandboxController {
  constructor(private readonly sandbox: MaterialSandboxService) {}

  @Put(':hash')
  @HttpCode(204)
  @ApiOperation({ summary: '存一份沙箱文档（body 体积上限由中间件与 DTO 双重把关，见模块注释）' })
  @ApiResponse({
    status: 400,
    description: 'MATERIAL_SANDBOX_HASH_MISMATCH / ..._SCRIPT_HASHES_INVALID',
  })
  put(@Param('hash') hash: string, @Body() dto: PutMaterialSandboxDocumentDto): void {
    this.sandbox.put(hash, dto.html, dto.scriptHashes);
  }

  @Head(':hash')
  @ApiOperation({ summary: '探测这份文档是否已经存过（客户端据此决定要不要 PUT）' })
  head(@Param('hash') hash: string, @Res() response: Response): void {
    response.status(this.sandbox.has(hash) ? 200 : 404).end();
  }

  @Get(':hash')
  @ApiOperation({ summary: '取沙箱文档；响应头 CSP 只放行校验过的脚本哈希' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  get(@Param('hash') hash: string, @Res() response: Response): void {
    const document = this.sandbox.get(hash);
    for (const [name, value] of Object.entries(BASE_SCREEN_ISOLATED_SANDBOX_HEADERS)) {
      response.setHeader(name, value);
    }
    response.setHeader('Content-Security-Policy', document.csp);
    response.status(200).send(document.html);
  }
}
