import { PickType } from '@nestjs/swagger';
import { AgentGenerateDto } from './agent-generate.dto';

export class AgentCandidateDto extends PickType(AgentGenerateDto, ['topic'] as const) {}
