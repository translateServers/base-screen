import { resolve } from 'node:path';
import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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
import { ListAssetsQueryDto, UploadAssetQueryDto } from './dto/asset-query.dto';

const UPLOAD_TEMP_DIR = resolve(hostAssetDir(), '.uploads');

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @ApiOperation({
    summary: '素材列表（默认公共；scope=temporary 查看临时；screenId 取公共 + 本屏临时）',
  })
  async list(
    @Query() query: ListAssetsQueryDto,
  ): Promise<{ assets: readonly AssetShape[]; total: number }> {
    return this.assets.list(query);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      dest: UPLOAD_TEMP_DIR,
      limits: { fileSize: ASSET_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary: '上传图片（默认公共；scope=temporary + screenId 时写入当前大屏的临时素材）',
  })
  @ApiResponse({ status: 400, description: 'ASSET_TYPE_UNSUPPORTED / ASSET_CONTENT_INVALID' })
  async upload(
    @UploadedFile() file: UploadedAssetFile | undefined,
    @Query() query: UploadAssetQueryDto,
  ): Promise<{ asset: AssetShape }> {
    // 参数组合校验放在 Service 内：multer 临时文件必须在失败路径也被清理。
    return { asset: await this.assets.upload(file, query) };
  }

  @Get(':id/content')
  @ApiOperation({ summary: '读取素材内容（公共长缓存；临时素材不缓存）' })
  async content(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const { buffer, asset } = await this.assets.content(id);
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', buffer.length);
    response.setHeader(
      'Cache-Control',
      asset.temporary ? 'no-store' : 'public, max-age=31536000, immutable',
    );
    response.end(buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除素材（被大屏引用时 409 + refScreens）' })
  @ApiResponse({ status: 409, description: 'ASSET_IN_USE（带 refScreens）' })
  async remove(@Param('id') id: string): Promise<{ deleted: true; id: string }> {
    return this.assets.remove(id);
  }
}
