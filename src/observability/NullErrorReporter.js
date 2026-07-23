// مُبلِّغ أخطاء لا-أثر (الافتراضي) — لا يرسل شيئاً حتى يُضبط مزوّد فعلي عبر configure.
import { ErrorReporter } from './contracts'

export class NullErrorReporter extends ErrorReporter {}
