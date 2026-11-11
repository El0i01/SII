import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

/** Mantém o processo vivo e avisa no log, a cada minuto, que o worker está de pé. */
@Injectable()
export class BatimentoService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('worker');
  private timer: NodeJS.Timeout | undefined;
  batimentos = 0;

  onModuleInit(): void {
    this.timer = setInterval(() => this.bater(), 60_000);
  }

  bater(): void {
    this.batimentos += 1;
    this.logger.debug(`batimento ${this.batimentos}`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
