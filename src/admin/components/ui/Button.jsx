// زر موحّد لوضع المنصّة — يستبدل btn(hex) المكرّرة في كل شاشة بـ variant دلالي واحد
// (primary/neutral/danger/success/ghost)، ويكتسب :hover و:focus-visible من admin-theme.css
// وهو ما لا يقدر Inline style الخالص على التعبير عنه إطلاقاً.
export default function Button({ variant = 'neutral', className = '', style, children, ...props }) {
  return (
    <button className={`admin-btn admin-btn--${variant}${className ? ' ' + className : ''}`} style={style} {...props}>
      {children}
    </button>
  )
}
