import { supabase } from './supabase'

const MAX_DIMENSION = 1080 // أقصى عرض/ارتفاع للصورة بعد الضغط (بكسل)
const JPEG_QUALITY = 0.8 // جودة ضغط JPEG (0-1)
const MAX_FILE_SIZE_MB = 5 // أقصى حجم مسموح للملف الأصلي قبل الضغط

/**
 * يضغط صورة في المتصفح (تصغير الأبعاد + تحويل لـ JPEG) قبل رفعها،
 * لتسريع الرفع من الجوال وتقليل استهلاك التخزين.
 * @param {File} file - ملف الصورة الأصلي من input[type=file]
 * @returns {Promise<Blob>} - الصورة المضغوطة كـ Blob جاهز للرفع
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => { img.src = e.target.result }
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    img.onerror = () => reject(new Error('الملف ليس صورة صالحة'))

    img.onload = () => {
      let { width, height } = img
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width)
          width = MAX_DIMENSION
        } else {
          width = Math.round((width * MAX_DIMENSION) / height)
          height = MAX_DIMENSION
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('فشل ضغط الصورة')),
        'image/jpeg',
        JPEG_QUALITY
      )
    }

    reader.readAsDataURL(file)
  })
}

/**
 * يضغط صورة ثم يرفعها إلى Supabase Storage في مسار مخصص للمطعم،
 * ويعيد الرابط العام الجاهز للاستخدام.
 * @param {File} file - ملف الصورة من input
 * @param {string} restaurantId - معرّف المطعم (يُستخدم كمجلد جذري للصلاحيات)
 * @param {string} folder - مجلد فرعي (مثل 'logo', 'categories', 'products')
 * @returns {Promise<string>} الرابط العام للصورة المرفوعة
 */
export async function compressAndUploadImage(file, restaurantId, folder) {
  if (!file) throw new Error('لم يتم اختيار ملف')
  if (!file.type.startsWith('image/')) throw new Error('يرجى اختيار ملف صورة صالح')
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`حجم الصورة كبير جداً، الحد الأقصى ${MAX_FILE_SIZE_MB} ميجابايت`)
  }

  const compressedBlob = await compressImage(file)
  const fileName = `${folder}/${Date.now()}.jpg`
  const path = `${restaurantId}/${fileName}`

  const { error } = await supabase.storage
    .from('restaurant-media')
    .upload(path, compressedBlob, { contentType: 'image/jpeg', upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from('restaurant-media').getPublicUrl(path)
  return data.publicUrl
}
