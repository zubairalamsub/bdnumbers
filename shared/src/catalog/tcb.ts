// TCB (Trading Corporation of Bangladesh) daily Dhaka retail prices. TCB publishes one XLSX per day
// with a min and max price per item; each item here becomes two series, tcb_<id>_min and tcb_<id>_max.

export const TCB_LIST_URL = 'https://tcb.gov.bd/pages/daily-rmps';

export type MarketGroup = 'rice' | 'flour' | 'oil' | 'pulses' | 'vegetables' | 'spices' | 'protein' | 'dairy' | 'misc';

export type TcbUnit =
  | 'kg'
  | 'kg-packet'
  | 'litre'
  | 'bottle-1l'
  | 'bottle-2l'
  | 'bottle-5l'
  | 'pack-1kg'
  | 'hali'
  | 'dista'
  | 'ton';

export interface TcbItem {
  id: string;
  group: MarketGroup;
  bn: string;
  en: string;
  unit: TcbUnit;
  /** Item name and unit exactly as TCB's sheet writes them; matched ignoring whitespace and digit style. */
  sheet: readonly [name: string, unit: string];
  /** Typical price (BDT) in Oct 2026; sanity bounds are ref/5 … ref×5. */
  ref: number;
}

const item = (
  id: string,
  group: MarketGroup,
  unit: TcbUnit,
  sheet: readonly [string, string],
  bn: string,
  en: string,
  ref: number,
): TcbItem => ({ id, group, unit, sheet, bn, en, ref });

export const TCB_ITEMS: readonly TcbItem[] = [
  item('rice_coarse', 'rice', 'kg', ['চাল (মোটা)/স্বর্ণা/চায়না ইরি', 'প্রতি কেজি'], 'মোটা চাল (স্বর্ণা/চায়না ইরি)', 'Coarse rice (Swarna/China IRRI)', 55),
  item('rice_medium', 'rice', 'kg', ['চাল (মাঝারী)পাইজাম/আটাশ', 'প্রতি কেজি'], 'মাঝারি চাল (পাইজাম/আটাশ)', 'Medium rice (Paijam/BR-28)', 65),
  item('rice_fine', 'rice', 'kg', ['চাল সরু (নাজির/মিনিকেট)', 'প্রতি কেজি'], 'সরু চাল (নাজির/মিনিকেট)', 'Fine rice (Nazirshail/Miniket)', 85),
  item('rice_aromatic', 'rice', 'kg', ['চাল সুগন্ধী (পোলাও)', 'প্রতি কেজি'], 'সুগন্ধি চাল (পোলাও, খোলা)', 'Aromatic rice (polao, loose)', 215),
  item('rice_aromatic_packet', 'rice', 'kg-packet', ['চাল সুগন্ধী (পোলাও)', 'প্রতি কেজি প্যাঃ'], 'সুগন্ধি চাল (পোলাও, প্যাকেট)', 'Aromatic rice (polao, packet)', 230),

  item('atta_loose', 'flour', 'kg', ['আটা সাদা (খোলা)', 'প্রতি কেজি'], 'আটা (খোলা)', 'Atta (loose)', 50),
  item('atta_packet', 'flour', 'kg-packet', ['আটা (প্যাকেট)', 'প্রতি কেজি প্যাঃ'], 'আটা (প্যাকেট)', 'Atta (packet)', 70),
  item('maida_loose', 'flour', 'kg', ['ময়দা (খোলা)', 'প্রতি কেজি'], 'ময়দা (খোলা)', 'Maida (loose)', 70),
  item('maida_packet', 'flour', 'kg-packet', ['ময়দা (প্যাকেট)', 'প্রতি কেজি প্যাঃ'], 'ময়দা (প্যাকেট)', 'Maida (packet)', 90),

  item('soybean_oil_loose', 'oil', 'litre', ['সয়াবিন তেল (লুজ)', 'প্রতি লিটার'], 'সয়াবিন তেল (খোলা)', 'Soybean oil (loose)', 200),
  item('soybean_oil_5l', 'oil', 'bottle-5l', ['সয়াবিন তেল (বোতল)', '৫ লিটার'], 'সয়াবিন তেল (৫ লিটার বোতল)', 'Soybean oil (5 L bottle)', 1000),
  item('soybean_oil_2l', 'oil', 'bottle-2l', ['সয়াবিন তেল (বোতল)', '২ লিটার'], 'সয়াবিন তেল (২ লিটার বোতল)', 'Soybean oil (2 L bottle)', 410),
  item('soybean_oil_1l', 'oil', 'bottle-1l', ['সয়াবিন তেল (বোতল)', '১ লিটার'], 'সয়াবিন তেল (১ লিটার বোতল)', 'Soybean oil (1 L bottle)', 204),
  item('palm_oil', 'oil', 'litre', ['পাম অয়েল (লুজ)', 'প্রতি লিটার'], 'পাম তেল (খোলা)', 'Palm oil (loose)', 175),
  item('super_palm_oil', 'oil', 'litre', ['সুপার পাম অয়েল (লুজ)', 'প্রতি লিটার'], 'সুপার পাম তেল (খোলা)', 'Super palm oil (loose)', 180),
  item('rice_bran_oil_5l', 'oil', 'bottle-5l', ['রাইস ব্রান তেল (বোতল)', '৫ লিটার'], 'রাইস ব্রান তেল (৫ লিটার বোতল)', 'Rice bran oil (5 L bottle)', 1200),

  item('lentil_bold', 'pulses', 'kg', ['মশুর ডাল (বড় দানা)', 'প্রতি কেজি'], 'মসুর ডাল (বড় দানা)', 'Red lentils (bold grain)', 100),
  item('lentil_medium', 'pulses', 'kg', ['মশুর ডাল (মাঝারী দানা)', 'প্রতি কেজি'], 'মসুর ডাল (মাঝারি দানা)', 'Red lentils (medium grain)', 120),
  item('lentil_small', 'pulses', 'kg', ['মশুর ডাল (ছোট দানা)', 'প্রতি কেজি'], 'মসুর ডাল (ছোট দানা)', 'Red lentils (small grain)', 160),
  item('mung_dal', 'pulses', 'kg', ['মুগ ডাল (মানভেদে)', 'প্রতি কেজি'], 'মুগ ডাল', 'Mung dal', 170),
  item('anchor_dal', 'pulses', 'kg', ['এ্যাংকর ডাল', 'প্রতি কেজি'], 'অ্যাংকর ডাল', 'Anchor (pea) dal', 75),
  item('chickpeas', 'pulses', 'kg', ['ছোলা (মানভেদে)', 'প্রতি কেজি'], 'ছোলা', 'Chickpeas', 125),

  item('potato', 'vegetables', 'kg', ['আলু (নতুন/পুরাতন)', 'প্রতি কেজি'], 'আলু', 'Potato', 30),
  item('onion_local', 'vegetables', 'kg', ['পিঁয়াজ (দেশী)', 'প্রতি কেজি'], 'পেঁয়াজ (দেশি)', 'Onion (local)', 60),
  item('onion_imported', 'vegetables', 'kg', ['পিঁয়াজ (আমদানি)', 'প্রতি কেজি'], 'পেঁয়াজ (আমদানি)', 'Onion (imported)', 60),
  item('green_chili', 'vegetables', 'kg', ['কাঁচামরিচ', 'প্রতি কেজি'], 'কাঁচা মরিচ', 'Green chili', 180),
  item('brinjal', 'vegetables', 'kg', ['বেগুন', 'প্রতি কেজি'], 'বেগুন', 'Brinjal', 120),
  item('cucumber', 'vegetables', 'kg', ['শসা', 'প্রতি কেজি'], 'শসা', 'Cucumber', 100),
  item('lemon', 'vegetables', 'hali', ['লেবু', 'প্রতি হালি'], 'লেবু', 'Lemon', 30),

  item('garlic_local', 'spices', 'kg', ['রসুন (দেশী)', 'প্রতি কেজি'], 'রসুন (দেশি)', 'Garlic (local)', 140),
  item('garlic_imported', 'spices', 'kg', ['রসুন (আমদানি)', 'প্রতি কেজি'], 'রসুন (আমদানি)', 'Garlic (imported)', 230),
  item('dried_chili_local', 'spices', 'kg', ['শুকনা মরিচ (দেশী)', 'প্রতি কেজি'], 'শুকনা মরিচ (দেশি)', 'Dried chili (local)', 380),
  item('dried_chili_imported', 'spices', 'kg', ['শুকনা মরিচ (আমদানি)', 'প্রতি কেজি'], 'শুকনা মরিচ (আমদানি)', 'Dried chili (imported)', 450),
  item('turmeric_local', 'spices', 'kg', ['হলুদ (দেশী)', 'প্রতি কেজি'], 'হলুদ (দেশি)', 'Turmeric (local)', 350),
  item('turmeric_imported', 'spices', 'kg', ['হলুদ (আমদানি)', 'প্রতি কেজি'], 'হলুদ (আমদানি)', 'Turmeric (imported)', 350),
  item('ginger_local', 'spices', 'kg', ['আদা (দেশী)', 'প্রতি কেজি'], 'আদা (দেশি)', 'Ginger (local)', 150),
  item('ginger_imported', 'spices', 'kg', ['আদা (আমদানি)', 'প্রতি কেজি'], 'আদা (আমদানি)', 'Ginger (imported)', 230),
  item('cumin', 'spices', 'kg', ['জিরা', 'প্রতি কেজি'], 'জিরা', 'Cumin', 650),
  item('cinnamon', 'spices', 'kg', ['দারুচিনি', 'প্রতি কেজি'], 'দারুচিনি', 'Cinnamon', 600),
  item('clove', 'spices', 'kg', ['লবঙ্গ', 'প্রতি কেজি'], 'লবঙ্গ', 'Cloves', 1600),
  item('cardamom', 'spices', 'kg', ['এলাচ(ছোট)', 'প্রতি কেজি'], 'এলাচ (ছোট)', 'Cardamom (small)', 5600),
  item('coriander', 'spices', 'kg', ['ধনে', 'প্রতি কেজি'], 'ধনিয়া', 'Coriander seed', 250),
  item('bay_leaf', 'spices', 'kg', ['তেজপাতা', 'প্রতি কেজি'], 'তেজপাতা', 'Bay leaf', 280),

  item('rui', 'protein', 'kg', ['রুই', 'প্রতি কেজি'], 'রুই মাছ', 'Rui fish', 450),
  item('hilsa', 'protein', 'kg', ['ইলিশ', 'প্রতি কেজি'], 'ইলিশ মাছ', 'Hilsa fish', 1800),
  item('beef', 'protein', 'kg', ['গরু', 'প্রতি কেজি'], 'গরুর মাংস', 'Beef', 850),
  item('mutton', 'protein', 'kg', ['খাসী', 'প্রতি কেজি'], 'খাসির মাংস', 'Mutton', 1350),
  item('chicken_broiler', 'protein', 'kg', ['মুরগী(ব্রয়লার)', 'প্রতি কেজি'], 'ব্রয়লার মুরগি', 'Chicken (broiler)', 190),
  item('chicken_local', 'protein', 'kg', ['মুরগী (দেশী)', 'প্রতি কেজি'], 'দেশি মুরগি', 'Chicken (local)', 750),
  item('egg', 'protein', 'hali', ['ডিম (ফার্ম)', 'প্রতি হালি'], 'ডিম (ফার্ম)', 'Eggs (farm)', 50),

  item('milk_dano', 'dairy', 'pack-1kg', ['ডানো', '১ কেজি'], 'গুঁড়া দুধ (ডানো)', 'Milk powder (Dano)', 950),
  item('milk_diploma', 'dairy', 'pack-1kg', ['ডিপ্লোমা (নিউজিল্যান্ড)', '১ কেজি'], 'গুঁড়া দুধ (ডিপ্লোমা)', 'Milk powder (Diploma)', 950),
  item('milk_fresh', 'dairy', 'pack-1kg', ['ফ্রেশ', '১ কেজি'], 'গুঁড়া দুধ (ফ্রেশ)', 'Milk powder (Fresh)', 950),
  item('milk_marks', 'dairy', 'pack-1kg', ['মার্কস', '১ কেজি'], 'গুঁড়া দুধ (মার্কস)', 'Milk powder (Marks)', 960),

  item('sugar', 'misc', 'kg', ['চিনি', 'প্রতি কেজি'], 'চিনি', 'Sugar', 115),
  item('dates', 'misc', 'kg', ['খেজুর(সাধারণ মানের)', 'প্রতি কেজি'], 'খেজুর (সাধারণ)', 'Dates (regular)', 550),
  item('salt', 'misc', 'kg', ['লবণ(প্যাঃ)আয়োডিনযুক্ত', 'প্রতি কেজি'], 'আয়োডিনযুক্ত লবণ (প্যাকেট)', 'Iodized salt (packet)', 42),
  item('writing_paper', 'misc', 'dista', ['লেখার কাগজ(সাদা)', 'প্রতি দিস্তা'], 'লেখার কাগজ (সাদা)', 'Writing paper (white)', 40),
  item('ms_rod_60', 'misc', 'ton', ['এম,এস রড (৬০ গ্রেড)', 'প্রতি মেঃটন'], 'এমএস রড (৬০ গ্রেড)', 'MS rod (grade 60)', 94500),
  item('ms_rod_40', 'misc', 'ton', ['এম,এস রড( ৪০ গ্রেড)', 'প্রতি মেঃটন'], 'এমএস রড (৪০ গ্রেড)', 'MS rod (grade 40)', 91000),
];

export const MARKET_GROUPS: readonly MarketGroup[] = ['rice', 'flour', 'oil', 'pulses', 'vegetables', 'spices', 'protein', 'dairy', 'misc'];

/**
 * Comparable form of a sheet name or unit: Unicode NFC (য়/ড়/ঢ় and vowel signs like ো have two encodings, and
 * TCB's sheet uses the other one), no zero-width joiners, no whitespace, Latin digits.
 */
export function tcbMatchKey(name: string, unit: string): string {
  const norm = (s: string) =>
    s
      .normalize('NFC')
      .replace(/[‌‍]/g, '')
      .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
      .replace(/\s+/g, '');
  return `${norm(name)}|${norm(unit)}`;
}

const BY_SHEET = new Map(TCB_ITEMS.map((i) => [tcbMatchKey(...i.sheet), i]));

export function tcbItemForSheet(name: string, unit: string): TcbItem | undefined {
  return BY_SHEET.get(tcbMatchKey(name, unit));
}
