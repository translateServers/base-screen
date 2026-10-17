// e2e 使用独立数据库，避免与开发/生产数据相互污染。
// 路径相对 prisma/ 解析（SQLite 相对路径以 schema 所在目录为基准）。
// 必须在任何模块导入前执行（jest setupFiles 的语义），Prisma Client 实例化时才读得到。
process.env.DATABASE_URL = 'file:../data/test.db';
