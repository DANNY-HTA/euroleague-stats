// Winner League referees: the league publishes their names only in Hebrew. English spellings for the site.
const NAMES = {
  'דן ילון': 'Dan Yalon', 'כפיר מועלם': 'Kfir Moalem', 'סעיד חורי': 'Said Khoury', 'עופר מנהיים': 'Ofer Manheim',
  'אדר פאר': 'Adar Peer', 'הראל קדרון': 'Harel Kidron', 'אורי שלהבי': 'Uri Shalhevi', 'עומר וסרמן': 'Omer Wasserman',
  'דוד איזמירלי': 'David Izmirli', 'עמית בלק': 'Amit Black', 'אור זרור': 'Or Zror', 'אסף אנגלברג': 'Asaf Engelberg',
  'גיא שמואלי': 'Guy Shmueli', "אלעד לייבוביץ'": 'Elad Leibovitz', 'צור תובל': 'Tzur Tuval', 'עומר אסתרון': 'Omer Estron',
  'צחי הבדלי': 'Tzahi Havdali', 'רותם קוזה': 'Rotem Koza', 'ניר מאירסון': 'Nir Meirson', 'נעם גורדון': 'Noam Gordon',
  'אופק קירשנבאום': 'Ofek Kirschenbaum', 'יובל דלבחה': 'Yuval Dalbaha', 'ספי שמש': 'Sefi Shemesh', 'דביר רייניש': 'Dvir Reinish',
  'ליאור ביניש': 'Lior Binish', 'עידן שטיין': 'Idan Stein', 'רון מן': 'Ron Man', 'ניר קרן': 'Nir Keren'
};
// fallback for a new referee: letter-by-letter spelling (rough, until added above)
const L = { 'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'o', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'i', 'כ': 'k', 'ך': 'ch', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't', "'": '', '"': '' };
const rough = (s) => s.split(/\s+/).map((w) => { const t = [...w].map((c, i) => (c === 'ב' && i ? 'v' : c === 'פ' && i ? 'f' : c === 'ו' && i === 0 ? 'v' : L[c] ?? c)).join('').replace(/^h(?=.)/, 'h'); return t.charAt(0).toUpperCase() + t.slice(1); }).join(' ');
const norm = (s) => String(s || '').replace(/&#39;/g, "'").replace(/[׳`’]/g, "'").replace(/\s+/g, ' ').trim();
export function refEnglish(name) {
  const n = norm(name);
  if (!/[֐-׿]/.test(n)) return n;
  return NAMES[n] || NAMES[n.replace(/'$/, '')] || rough(n);
}
