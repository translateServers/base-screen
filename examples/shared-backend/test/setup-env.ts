// e2e 使用独立数据库，避免与开发/生产数据相互污染。
// 路径相对 prisma/ 解析（SQLite 相对路径以 schema 所在目录为基准）。
// 必须在任何模块导入前执行（jest setupFiles 的语义），Prisma Client 实例化时才读得到。
process.env.DATABASE_URL = 'file:../data/test.db';
// 故障注入默认关闭，只有显式开关才生效；e2e 的 `?fail=500` 用例需要它。
process.env.DATASET_FAIL_INJECTION = '1';
// 示例数据源播种（P0-15）在测试里关掉：A1 的 `items.length = 4 + 自建数` 与 A12 的
// `custom.ds-1` 都需要一张确定的空表，否则两条播种行会让计数与序号漂移。
// 播种本身由 `datasources.service.spec.ts` 直接调 `ensureSeed()` 覆盖。
process.env.DATASOURCE_SEED = '0';
