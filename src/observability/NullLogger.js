// مُسجِّل لا-أثر (الافتراضي) — يبقي الطبقة خاملة تماماً بصفر تكلفة تشغيلية.
import { Logger } from './contracts'

export class NullLogger extends Logger {}
