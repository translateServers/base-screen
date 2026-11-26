import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * 本地 OpenAI 兼容桩：真实起一个 HTTP 服务，让 `agent-client` 的 fetch、超时、状态码与
 * 空响应分支全部走真实网络路径，而不是 mock 掉客户端函数。
 *
 * 每个请求由测试注入的 `responder` 决定如何回应，并按序记录请求体，便于断言
 * 「路由花了几次模型调用」「提示词里带没带目录」这类链路事实。
 */

export interface RecordedCall {
  readonly path: string;
  readonly body: Record<string, unknown>;
}

export type Responder = (call: RecordedCall, index: number) => Promise<StubReply> | StubReply;

export type StubReply =
  | { readonly kind: 'json'; readonly status?: number; readonly body: unknown }
  /**
   * 流式补全：每段正文写成一条 `data:` 事件，段与段之间隔 `delayMs`。
   * `end: 'destroy'` 表示写完这些段后直接掐断连接；`'hang'` 表示写完后不再出声（模拟输出到一半卡住）。
   */
  | {
      readonly kind: 'sse';
      readonly chunks: readonly string[];
      readonly delayMs?: number;
      readonly end?: 'done' | 'destroy' | 'hang';
    }
  | { readonly kind: 'hang' }
  | { readonly kind: 'socket-destroy' };

export interface LlmStub {
  readonly baseUrl: string;
  readonly calls: RecordedCall[];
  setResponder(responder: Responder): void;
  close(): Promise<void>;
}

/** 把模型返回的 assistant 文本包成 OpenAI chat.completions 形态。 */
export function chatText(content: string): StubReply {
  return { kind: 'json', body: { choices: [{ message: { content } }] } };
}

/** 把一段 assistant 文本切成若干段流式返回。 */
export function chatStream(content: string, pieces = 8, delayMs = 0): StubReply {
  const size = Math.max(1, Math.ceil(content.length / pieces));
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += size) {
    chunks.push(content.slice(index, index + size));
  }
  return { kind: 'sse', chunks, delayMs };
}

/** 工具调用形态：路由用它；name 对应 agent-route 的 action。 */
export function chatToolCall(name: string, args: Record<string, unknown>): StubReply {
  return {
    kind: 'json',
    body: {
      choices: [
        {
          message: {
            tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }],
          },
        },
      ],
    },
  };
}

export async function startLlmStub(initial: Responder): Promise<LlmStub> {
  const calls: RecordedCall[] = [];
  let responder: Responder = initial;
  const sockets = new Set<import('node:net').Socket>();

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    readBody(req)
      .then(async (raw) => {
        const body = raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
        const call: RecordedCall = { path: req.url ?? '', body };
        calls.push(call);
        const reply = await responder(call, calls.length - 1);
        if (reply.kind === 'hang') return; // 永不回包，交给客户端超时
        if (reply.kind === 'socket-destroy') {
          req.socket.destroy();
          return;
        }
        if (reply.kind === 'sse') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          for (const chunk of reply.chunks) {
            const event = { choices: [{ delta: { content: chunk } }] };
            res.write(`data: ${JSON.stringify(event)}\n\n`);
            if ((reply.delayMs ?? 0) > 0) {
              await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
            }
          }
          if (reply.end === 'destroy') {
            req.socket.destroy();
            return;
          }
          if (reply.end === 'hang') return; // 写到一半不再出声，交给客户端的空闲超时
          res.end('data: [DONE]\n\n');
          return;
        }
        res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    calls,
    setResponder(next) {
      responder = next;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
