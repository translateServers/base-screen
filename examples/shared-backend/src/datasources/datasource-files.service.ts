import { Injectable } from '@nestjs/common';
import { SqliteExecutionError, SqliteExecutorService } from '../sqlite/sqlite-executor.service';
import type { DatabaseFileInfo, DatabaseSchemaInfo } from './datasource.types';
import { datasourceFailureToHttp } from './datasource-errors';
import { listDatabaseFiles, resolveDatabaseFile } from './datasource-path';

/**
 * 受管目录的文件枚举与表结构读取（架构 §3.4 #2/#3、PRD A16–A18）。
 *
 * 路径校验完全交给 `datasource-path.ts`（basename 白名单 + realpath 父目录比较 +
 * 宿主库黑名单）：本服务只负责把「校验失败」翻成 HTTP 错误，把「路径不存在」翻成
 * 用户能看懂的空态。绝对路径始终留在服务端内部，不进任何响应。
 */
@Injectable()
export class DatasourceFilesService {
  constructor(private readonly sqlite: SqliteExecutorService) {}

  /** `GET /api/datasources/database-files`：只列受管目录内的 `.db`，排除宿主库。 */
  list(): readonly DatabaseFileInfo[] {
    return listDatabaseFiles();
  }

  /**
   * `GET /api/datasources/database-files/:name/tables`：表/视图 + 每张表的列。
   *
   * 打不开的库（不是 SQLite 文件、WAL 缺 `-shm`）统一按 `INVALID_SHAPE` 400 返回，
   * 文案是白名单里的固定句子，不含引擎文本也不含绝对路径（A17 的字符串断言）。
   */
  async schema(name: string): Promise<DatabaseSchemaInfo> {
    const resolved = resolveDatabaseFile(name);
    if (resolved.ok === false) {
      throw datasourceFailureToHttp(resolved.code, resolved.message);
    }
    try {
      const described = await this.sqlite.describe(resolved.absolutePath);
      return { tables: described.tables, columns: described.columns };
    } catch (error) {
      if (error instanceof SqliteExecutionError) {
        throw datasourceFailureToHttp(error.code, error.message);
      }
      throw datasourceFailureToHttp('INVALID_SHAPE', '无法读取该数据库文件的表结构。');
    }
  }
}
