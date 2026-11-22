import { Controller, Get, Header, type MessageEvent, Query, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MetricsQueryDto, RankingQueryDto } from './dto/metrics-query.dto';
import type { MetricRanking, MetricSeries } from './metrics.service';
import { MetricsService, STREAM_TICK_MS } from './metrics.service';

/** 推送流心跳：前端资源类型声明的静默超时（20 秒）要大于它。 */
const STREAM_HEARTBEAT_MS = 15_000;

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('series')
  @ApiOperation({ summary: '确定性 mock 指标时序（同参数同结果）' })
  series(@Query() query: MetricsQueryDto): MetricSeries {
    return this.metrics.series(query.metric, query.points);
  }

  @Get('ranking')
  @ApiOperation({ summary: '确定性区域/渠道排行（供图表与轮播列表消费）' })
  ranking(@Query() query: RankingQueryDto): MetricRanking {
    return this.metrics.ranking(query.dimension, query.limit);
  }

  /**
   * 推送演示（ADR-0104）：订阅即发 `snapshot`（最近 `points` 个采样点），之后每 2 秒一个 `point`，
   * 每 15 秒一个 `heartbeat`。每条数据事件带 `id: <epoch>:<revision>`，序号来自服务端统一时钟，
   * 重连后单调不回退；进程重启换 epoch。参数非法时在建立流之前就返回 400（与 `series` 同码）。
   */
  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({ summary: '指标推送流（SSE）：snapshot + point + heartbeat' })
  stream(@Query() query: MetricsQueryDto): Observable<MessageEvent> {
    const metric = query.metric;
    const initial = this.metrics.streamWindow(metric, query.points);
    const epoch = this.metrics.streamEpoch;
    const window = initial.series.points.length;
    return new Observable<MessageEvent>((subscriber) => {
      let sent = initial.revision;
      subscriber.next({ type: 'snapshot', id: `${epoch}:${sent}`, data: initial.series });
      const tick = setInterval(() => {
        const head = this.metrics.streamIndex() + window - 1;
        if (head - sent > window) {
          // 事件循环被阻塞、落后超过一个窗口：补不齐就发新快照，不做部分补洞（ADR-0104 §2.2）。
          const fresh = this.metrics.streamWindow(metric, window);
          subscriber.next({
            type: 'snapshot',
            id: `${epoch}:${fresh.revision}`,
            data: fresh.series,
          });
          sent = fresh.revision;
          return;
        }
        for (let index = sent + 1; index <= head; index += 1) {
          subscriber.next({
            type: 'point',
            id: `${epoch}:${index}`,
            data: { metric, point: this.metrics.streamPoint(metric, index) },
          });
        }
        sent = Math.max(sent, head);
      }, STREAM_TICK_MS);
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: {} });
      }, STREAM_HEARTBEAT_MS);
      return () => {
        clearInterval(tick);
        clearInterval(heartbeat);
      };
    });
  }
}
