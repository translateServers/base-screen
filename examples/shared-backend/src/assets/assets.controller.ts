import { resolve } from 'node:path';
import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AssetShape, UploadedAssetFile } from './asset.types';
import { ASSET_MAX_BYTES } from './asset.types';
import { AssetsService, hostAssetDir } from './assets.service';

const UPLOAD_TEMP_DIR = resolve(hostAssetDir(), '.uploads');

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @ApiOperation({ summary: '素材列表（只返回身份与宿主展示元数据，不返回签名 URL）' })
  async list(): Promise<{ assets: readonly AssetShape[] }> {
    return { assets: await this.assets.list() };
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      dest: UPLOAD_TEMP_DIR,
      limits: { fileSize: ASSET_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: '上传图片（PNG / JPEG / WebP / GIF，5 MB 上限）' })
  @ApiResponse({ status: 400, description: 'ASSET_TYPE_UNSUPPORTED / ASSET_CONTENT_INVALID' })
  async upload(
    @UploadedFile() file: UploadedAssetFile | undefined,
  ): Promise<{ asset: AssetShape }> {
    return { asset: await this.assets.upload(file) };
  }

  @Get(':id/content')
  @ApiOperation({ summary: '读取素材内容（稳定 URL；宿主可在此换成签名 CDN）' })
  async content(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const { buffer, asset } = await this.assets.content(id);
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', buffer.length);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.end(buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除素材（被大屏引用时 409 + refScreens）' })
  @ApiResponse({ status: 409, description: 'ASSET_IN_USE（带 refScreens）' })
  async remove(@Param('id') id: string): Promise<{ deleted: true; id: string }> {
    return this.assets.remove(id);
  }
}
