import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';
import { MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES } from '../material-sandbox.service';

/**
 * `hash` 在路径参数里，不重复放进请求体。`html` 的字节上限在 Service 里按 UTF-8 精确核验
 * （这里的 `Length` 只是防止离谱超长字符串占满内存再被拒绝，字符数上限故意比字节上限宽松）。
 */
export class PutMaterialSandboxDocumentDto {
  @IsString()
  @Length(1, MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES)
  html!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  scriptHashes!: string[];
}
