import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { DemoAlarmLevel } from '../alarm-events';

const ALARM_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class RaiseAlarmDto {
  @IsString()
  @Matches(ALARM_KEY_PATTERN)
  key!: string;

  @IsOptional()
  @IsIn(['warning', 'critical', 'info'])
  level?: DemoAlarmLevel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

export class AlarmKeyDto {
  @IsString()
  @Matches(ALARM_KEY_PATTERN)
  key!: string;
}

export class SuppressAlarmDto extends AlarmKeyDto {
  @IsBoolean()
  suppressed!: boolean;
}
