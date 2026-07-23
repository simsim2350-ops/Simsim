// مُسجِّل بسياق ثابت (Decorator) يلتف حول مُسجِّل آخر — بلا مزوّد خارجي، بلا آثار جانبية.
import { Logger } from './contracts'
import { NullLogger } from './NullLogger'

export class ContextLogger extends Logger {
  #inner; #ctx
  constructor(inner, ctx = {}) { super(); this.#inner = inner || new NullLogger(); this.#ctx = ctx }
  log(level, message, meta) { this.#inner.log(level, message, { ...this.#ctx, ...meta }) }
  withContext(ctx) { return new ContextLogger(this.#inner, { ...this.#ctx, ...ctx }) }
}
