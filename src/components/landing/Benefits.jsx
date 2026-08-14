import Icon from './Icons'
import { VALUE_LIST } from '../../config/landingContent'

// عرض القيمة — «سمسم مو مجرد منيو».
export default function Benefits() {
  return (
    <section className="ss-section" id="benefits">
      <div className="ss-container ss-value__wrap">
        <div className="ss-value__copy ss-reveal">
          <span className="ss-eyebrow">💡 الحل</span>
          <h2 style={{ marginTop: 16 }}>سمسم ليس مجرد منيو.</h2>
          <p>إنه منصّة تساعد مطعمك على عرض المنيو، استقبال الطلبات، وإدارة تجربة عميلك وولائه — من مكان واحد.</p>
          <ul className="ss-value__list">
            {VALUE_LIST.map((v) => (
              <li className="ss-value__row" key={v}>
                <span className="ss-value__check"><Icon name="check" size={16} /></span>
                {v}
              </li>
            ))}
          </ul>
        </div>

        <div className="ss-value__cards ss-reveal" data-delay="1">
          <div className="ss-value__card ss-value__card--accent">
            <div className="ss-num">دقائق</div>
            <div className="ss-lbl">تنشئ منيوك كاملاً</div>
          </div>
          <div className="ss-value__card">
            <div className="ss-num">0 ﷼</div>
            <div className="ss-lbl">للبدء بدون بطاقة</div>
          </div>
          <div className="ss-value__card">
            <div className="ss-num">QR</div>
            <div className="ss-lbl">جاهز للطباعة فوراً</div>
          </div>
          <div className="ss-value__card ss-value__card--accent">
            <div className="ss-num">24/7</div>
            <div className="ss-lbl">منيوك متاح دائماً</div>
          </div>
        </div>
      </div>
    </section>
  )
}
