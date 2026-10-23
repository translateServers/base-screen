import { Body, Controller, Get, Header, type MessageEvent, Post, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AlarmsService } from './alarms.service';
import { AlarmKeyDto, RaiseAlarmDto, SuppressAlarmDto } from './dto/alarm.dto';

/**
 * 实时告警演示：宿主从 `/api/demo/alarms/stream` 消费 SSE，把当前告警快照映射成
 * `conditionalStylePort` 的样式覆盖；屏幕文档本身不保存任何告警知识。
 */
@ApiTags('alarms')
@Controller('demo/alarms')
export class AlarmsController {
  constructor(private readonly alarms: AlarmsService) {}

  @Get()
  @ApiOperation({ summary: '当前告警快照（revision + alarms）' })
  snapshot() {
    return this.alarms.snapshot();
  }

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({ summary: '告警 SSE 流：订阅时先发 snapshot，随后推送增量事件' })
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: this.alarms.snapshotEvent() });
      const events = this.alarms.events.subscribe((event) => subscriber.next({ data: event }));
      const heartbeat = setInterval(() => {
        subscriber.next({ data: { type: 'heartbeat' } });
      }, 15_000);
      return () => {
        clearInterval(heartbeat);
        events.unsubscribe();
      };
    });
  }

  @Post('raise')
  @ApiOperation({ summary: '触发或更新一条告警（按 key 幂等）' })
  raise(@Body() dto: RaiseAlarmDto) {
    return { alarm: this.alarms.raise(dto) };
  }

  @Post('clear')
  @ApiOperation({ summary: '解除一条告警' })
  clear(@Body() dto: AlarmKeyDto) {
    return { changed: this.alarms.clear(dto.key) };
  }

  @Post('ack')
  @ApiOperation({ summary: '确认一条告警（确认后不再参与告警样式）' })
  acknowledge(@Body() dto: AlarmKeyDto) {
    return { changed: this.alarms.acknowledge(dto.key) };
  }

  @Post('suppress')
  @ApiOperation({ summary: '屏蔽或恢复一条告警' })
  suppress(@Body() dto: SuppressAlarmDto) {
    return { changed: this.alarms.suppress(dto.key, dto.suppressed) };
  }

  @Post('reset')
  @ApiOperation({ summary: '恢复演示初始快照' })
  reset() {
    return this.alarms.reset();
  }
}
