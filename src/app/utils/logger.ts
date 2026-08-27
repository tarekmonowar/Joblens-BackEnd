export class Logger {
  constructor(private readonly context: string) {}

  log(message: string) {
    console.log(`[${this.context}] ${message}`);
  }

  warn(message: string) {
    console.warn(`[${this.context}] ${message}`);
  }

  error(message: string) {
    console.error(`[${this.context}] ${message}`);
  }
}
