import { PickType } from '@nestjs/swagger';
import { AgentGenerateDto } from './agent-generate.dto';

/** 候选不创建大屏，因此不接受 `name`；目录与主题一样随请求带入。 */
export class AgentCandidateDto extends PickType(AgentGenerateDto, ['topic', 'catalog', 'references'] as const) {}
