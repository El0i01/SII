import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface EstadoServico {
  status: 'ok';
  servico: 'api';
  horario: string;
}

@ApiTags('infra')
@Controller('health')
export class StatusController {
  // Banco e Redis entram neste retorno no P02.
  @Get()
  @ApiOkResponse({ description: 'A API está no ar.' })
  verificar(): EstadoServico {
    return { status: 'ok', servico: 'api', horario: new Date().toISOString() };
  }
}
