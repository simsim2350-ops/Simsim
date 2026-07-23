// تجريد التسجيل لطبقة التكامل — يعيد التصدير من طبقة Observability الموحّدة (مصدر واحد، بلا تكرار).
// طبقة التكامل تستهلك المُسجِّل عبر هذه الواجهة كما كانت؛ التنفيذ الآن يعيش في src/observability.
import { NullLogger } from '../../observability'
export { Logger, NullLogger, ContextLogger } from '../../observability'

/** مُسجِّل افتراضي مشترك لطبقة التكامل (خامل). يُستبدَل عبر الإعدادات لاحقاً. */
export const defaultLogger = new NullLogger()
