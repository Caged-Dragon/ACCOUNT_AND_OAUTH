// Server-side translations for the consent screen (English text is the key).
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = {
  ta: {
    'by Caged Dragon': 'Caged Dragon வழங்குவது',
    'Sign in to {name}?': '{name}-இல் உள்நுழையவா?',
    '<b>{name}</b> wants to sign you in as <b>{who}</b>. It will be able to:': '<b>{name}</b> உங்களை <b>{who}</b> ஆக உள்நுழைய வைக்க விரும்புகிறது. அது இவற்றைச் செய்ய முடியும்:',
    'Confirm that it is you': 'நீங்கள்தான் என்பதை உறுதிசெய்ய', 'See your email address': 'உங்கள் மின்னஞ்சல் முகவரியைப் பார்க்க',
    'See your name and username': 'உங்கள் பெயரையும் பயனர்பெயரையும் பார்க்க', 'See your phone number': 'உங்கள் கைபேசி எண்ணைப் பார்க்க',
    'It can’t change your account or see your password.': 'இது உங்கள் கணக்கை மாற்றவோ கடவுச்சொல்லைப் பார்க்கவோ முடியாது.',
    'Warning: this product isn’t using a secure address.': 'எச்சரிக்கை: இந்தத் தயாரிப்பு பாதுகாப்பான முகவரியைப் பயன்படுத்தவில்லை.',
    'You’ll be sent to <b>{host}</b> afterwards.': 'அதன் பிறகு நீங்கள் <b>{host}</b>-க்கு அனுப்பப்படுவீர்கள்.',
    'Allow': 'அனுமதி', 'Cancel': 'ரத்து', 'Not you? Use a different account': 'நீங்கள் இல்லையா? வேறு கணக்கைப் பயன்படுத்தவும்',
    'Request not valid': 'கோரிக்கை செல்லாது', 'Open this page from a Caged Dragon product, then try again.': 'Caged Dragon தயாரிப்பிலிருந்து இந்தப் பக்கத்தைத் திறந்து மீண்டும் முயலவும்.',
    'Request expired': 'கோரிக்கை காலாவதியானது', 'This sign-in request is no longer valid. Go back to the product and try again.': 'இந்த உள்நுழைவு கோரிக்கை இனி செல்லாது. தயாரிப்புக்குத் திரும்பிச் சென்று மீண்டும் முயலவும்.',
    'Something went wrong': 'ஏதோ தவறு நடந்தது', 'We couldn’t finish that. Go back to the product and try again.': 'அதை முடிக்க முடியவில்லை. தயாரிப்புக்குத் திரும்பிச் சென்று மீண்டும் முயலவும்.'
  },
  hi: {
    'by Caged Dragon': 'Caged Dragon की ओर से',
    'Sign in to {name}?': '{name} में साइन इन करें?',
    '<b>{name}</b> wants to sign you in as <b>{who}</b>. It will be able to:': '<b>{name}</b> आपको <b>{who}</b> के रूप में साइन इन करना चाहता है। यह ये कर सकेगा:',
    'Confirm that it is you': 'पुष्टि करना कि यह आप ही हैं', 'See your email address': 'आपका ईमेल पता देखना',
    'See your name and username': 'आपका नाम और यूज़रनेम देखना', 'See your phone number': 'आपका फ़ोन नंबर देखना',
    'It can’t change your account or see your password.': 'यह आपका खाता नहीं बदल सकता और न ही आपका पासवर्ड देख सकता है।',
    'Warning: this product isn’t using a secure address.': 'चेतावनी: यह प्रोडक्ट सुरक्षित पते का उपयोग नहीं कर रहा।',
    'You’ll be sent to <b>{host}</b> afterwards.': 'इसके बाद आपको <b>{host}</b> पर भेजा जाएगा।',
    'Allow': 'अनुमति दें', 'Cancel': 'रद्द करें', 'Not you? Use a different account': 'आप नहीं हैं? दूसरा खाता इस्तेमाल करें',
    'Request not valid': 'अनुरोध मान्य नहीं', 'Open this page from a Caged Dragon product, then try again.': 'इस पेज को किसी Caged Dragon प्रोडक्ट से खोलें, फिर कोशिश करें।',
    'Request expired': 'अनुरोध की अवधि समाप्त', 'This sign-in request is no longer valid. Go back to the product and try again.': 'यह साइन-इन अनुरोध अब मान्य नहीं है। प्रोडक्ट पर वापस जाकर फिर कोशिश करें।',
    'Something went wrong': 'कुछ गड़बड़ हो गई', 'We couldn’t finish that. Go back to the product and try again.': 'हम इसे पूरा नहीं कर सके। प्रोडक्ट पर वापस जाकर फिर कोशिश करें।'
  }
};
// vars are HTML-escaped unless raw is true (used for <title>, which shell() escapes itself)
export const consentT = lang => (key, vars = {}, raw = false) => {
  let s = (D[lang] && D[lang][key]) || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', raw ? String(v) : esc(v));
  return s;
};
export const langOf = req => { const l = String(req.query.lang || req.cookies.cd_lang || '').slice(0, 2); return l === 'ta' || l === 'hi' ? l : 'en'; };
