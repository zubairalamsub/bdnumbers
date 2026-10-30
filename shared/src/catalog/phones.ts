// Mobile phone prices: the shops we read, the brands we recognise, and how a shop's product name becomes
// a model that lines up across shops. Shops write the same phone many ways ("Galaxy A57 5G",
// "Samsung Galaxy A57 5G (12/256GB)", "Samsung Galaxy A57 5G Price in Bangladesh"), so names are cleaned
// and reduced to a matching key; RAM/storage and official/unofficial are kept apart from the model.

export interface PhoneShop {
  id: string;
  name: string;
  url: string;
}

/** The phone shops whose prices are compared (alphabetical; the order tables use when prices tie). */
export const PHONE_SHOPS: readonly PhoneShop[] = [
  { id: 'applegadgets', name: 'Apple Gadgets', url: 'https://www.applegadgetsbd.com' },
  { id: 'dazzle', name: 'Dazzle', url: 'https://dazzle.com.bd' },
  { id: 'gadgetandgear', name: 'Gadget & Gear', url: 'https://gadgetandgear.com' },
  { id: 'kry', name: 'KRY International', url: 'https://kryinternational.com' },
  { id: 'rio', name: 'Rio International', url: 'https://riointernational.com.bd' },
  // Replaced Sumash Tech on 2026-10-31: its Cloudflare had challenged every request from ours since 25 Oct.
  { id: 'smsgadget', name: 'SMS Gadget', url: 'https://smsgadget.com' },
];

export const phoneShop = (id: string): PhoneShop | undefined => PHONE_SHOPS.find((s) => s.id === id);

/** Official (with the brand's Bangladesh warranty) or unofficial (imported); null when the shop doesn't say. */
export type PhoneKind = 'official' | 'unofficial';
/** In stock, out of stock, or pre-order. */
export type PhoneStock = 'in' | 'out' | 'pre';

export interface PhoneBrand {
  id: string;
  name: string;
  /**
   * Words a product name may start with for this brand. The first is the brand's own name; the rest are
   * series names often written without it ("Galaxy A57", "iPhone 17", "Redmi Note 15").
   */
  words: readonly string[];
  /** Series names that stand on their own, without the brand word: "Xiaomi Redmi Note 15" → "Redmi Note 15". */
  standalone?: readonly string[];
  /** For brands that also sell other things: a phone's name must match this (checked on the cleaned name). */
  phone?: RegExp;
}

/** Phone brands sold in Bangladesh. A product whose name starts with none of these words isn't treated as a phone. */
export const PHONE_BRANDS: readonly PhoneBrand[] = [
  { id: 'apple', name: 'Apple', words: ['apple', 'iphone'], standalone: ['iphone'], phone: /^iphone\b/ },
  { id: 'samsung', name: 'Samsung', words: ['samsung', 'galaxy'], phone: /^samsung galaxy\b/ },
  { id: 'xiaomi', name: 'Xiaomi', words: ['xiaomi', 'redmi', 'poco', 'mi'], standalone: ['redmi', 'poco'], phone: /^(redmi|poco) |^xiaomi (\d|mix|civi)/ },
  { id: 'google', name: 'Google', words: ['google', 'pixel'], phone: /^google pixel\b/ },
  { id: 'oneplus', name: 'OnePlus', words: ['oneplus'] },
  { id: 'nothing', name: 'Nothing', words: ['nothing', 'cmf'], standalone: ['cmf'], phone: /\bphone\b/ },
  { id: 'honor', name: 'Honor', words: ['honor'] },
  { id: 'huawei', name: 'Huawei', words: ['huawei'], phone: /^huawei (nova|mate|pura|enjoy|p\d|y\d)/ },
  { id: 'vivo', name: 'Vivo', words: ['vivo'] },
  { id: 'iqoo', name: 'iQOO', words: ['iqoo'] },
  { id: 'oppo', name: 'Oppo', words: ['oppo'] },
  { id: 'realme', name: 'Realme', words: ['realme'] },
  { id: 'motorola', name: 'Motorola', words: ['motorola', 'moto', 'razr'], standalone: ['moto'] },
  { id: 'infinix', name: 'Infinix', words: ['infinix'] },
  { id: 'tecno', name: 'Tecno', words: ['tecno', 'pova', 'camon', 'phantom'] },
  { id: 'itel', name: 'itel', words: ['itel'] },
  { id: 'nokia', name: 'Nokia', words: ['nokia'] },
  { id: 'hmd', name: 'HMD', words: ['hmd'] },
  { id: 'zte', name: 'ZTE', words: ['zte', 'nubia'], standalone: ['nubia'] },
  { id: 'sony', name: 'Sony', words: ['sony', 'xperia'], phone: /^sony xperia\b/ },
  { id: 'asus', name: 'Asus', words: ['asus', 'rog', 'zenfone'], phone: /\b(rog phone|zenfone)\b/ },
  { id: 'meizu', name: 'Meizu', words: ['meizu'] },
  { id: 'symphony', name: 'Symphony', words: ['symphony'] },
  { id: 'helio', name: 'Helio', words: ['helio'] },
  { id: 'lava', name: 'Lava', words: ['lava'] },
  { id: 'benco', name: 'Benco', words: ['benco'] },
  { id: 'maximus', name: 'Maximus', words: ['maximus'] },
  { id: 'xtra', name: 'Xtra', words: ['xtra'] },
];

const BRAND_BY_WORD = new Map(PHONE_BRANDS.flatMap((b) => b.words.map((w) => [w, b] as const)));
export const phoneBrand = (id: string): PhoneBrand | undefined => PHONE_BRANDS.find((b) => b.id === id);

/**
 * Words that mark a product as something other than a new phone: accessories, tablets, watches, earbuds,
 * other gadgets, and used or refurbished stock.
 */
const NOT_A_PHONE = new Set(
  (
    'case cover covers bumper glass protector protectors tempered film skin charger charging adapter cable cables ' +
    'buds earbuds freebuds enco tws earphone earphones headphone headphones headset neckband airpods ear pods ' +
    'watch smartwatch band bands fit ring tab tablet pad ipad matepad megapad xpad book macbook matebook magicbook ' +
    'redmibook laptop notebook chromebook imac ipod homepod vision monitor tv television inch router speaker ' +
    'soundbar lens tripod gimbal selfie strap holder stand mount dock hub magsafe powerbank bank battery mouse ' +
    'keyboard pencil pen stylus tag airtag tracker trimmer shaver clipper toothbrush dryer vacuum cleaner purifier ' +
    'humidifier fryer cooler kettle scale bulb lamp light camera dashcam projector printer drone scooter ' +
    'controller gamepad remote bag backpack sleeve pouch wallet grip clip kit sim tray housing replacement display ' +
    'screen ssd sd microsd memory card pendrive usb otg hdd mijia used refurbished renewed preowned owned demo ' +
    'combo bundle glasses mirror bottle massager thermometer fan handheld choice bullets'
  ).split(' '),
);

/** A few of those words are part of real phone names. */
const PHONE_PHRASES = [/\b(moto g|edge \d+) stylus\b/];

/**
 * Colours a shop may end a name with ("iPhone 13 Starlight", "… Natural Titanium"): they name a finish,
 * not a model, so they are dropped from the end of the name.
 */
const COLOURS = new Set(
  (
    'black white blue green red purple pink gold silver gray grey graphite titanium natural desert starlight midnight ' +
    'sierra alpine coral yellow orange lavender mint cream violet sage teal cosmic deep mist ultramarine jet ocean sky ' +
    'navy rose bronze copper champagne icy frost glacier aurora emerald jade olive lime peach lilac porcelain obsidian onyx'
  ).split(' '),
);

export interface ParsedPhoneName {
  /** Matching key: brand and model words run together, without network words, e.g. "samsunggalaxya57". */
  key: string;
  /** "5g" or "4g" when the name says; the same model is often listed both with and without it. */
  network: '5g' | '4g' | null;
  brand: string;
  /** The model as a person would write it, e.g. "Samsung Galaxy A57 5G". */
  name: string;
  /** "8/256GB", "256GB" or "1TB" when the name gives one. */
  variant: string | null;
  kind: PhoneKind | null;
}

const RAM_GB = new Set([1, 2, 3, 4, 6, 8, 10, 12, 16, 18, 24]);
const STORAGE_GB = new Set([32, 64, 128, 256, 512]);

/**
 * RAM and storage: "8/256GB", "8GB/256GB", "8/256" (storage unit left out), "8GB 256GB", "8GB RAM 256GB ROM",
 * "8+256GB". A bare number before a size is never read as RAM: in "iPhone 16 128GB" the 16 is the model.
 */
const RAM_STORAGE = [
  /\b(\d{1,2})\s*(?:gb)?\s*[/|]\s*(\d{1,4})\s*(gb|tb)?\b/i,
  /\b(\d{1,2})\s*gb\s*(?:ram)?[\s,+-]+(\d{1,4})\s*(gb|tb)\b(?:\s*(?:rom|storage))?/i,
  /\b(\d{1,2})\s*\+\s*(\d{1,4})\s*(gb|tb)\b/i,
];
const STORAGE_ONLY = /\b(\d{1,4})\s*(gb|tb)\b/i;

function storage(n: number, unit: string | undefined): string | null {
  const u = (unit ?? (n <= 2 ? 'tb' : 'gb')).toLowerCase();
  if (u === 'tb') return n === 1 || n === 2 ? `${n}TB` : null;
  return STORAGE_GB.has(n) ? `${n}GB` : n === 1024 ? '1TB' : null;
}

/** Region, SIM and edition labels and shop boilerplate: they change the price, not the model. */
const LABELS =
  /\b(?:price in (?:bd|bangladesh)(?: \d{4})?|in bangladesh|bd price|global(?: version| rom)?|international(?: version)?|chinese version|china(?: version| rom)?|china|indian?(?: version)?|ind|usa?(?: version)?|jp|japan|hk|sg|uae|kr|korea|dual sim|single sim|physical sim|e-?sim|nano sim|ds|with warranty|brand new|new|snapdragon|exynos|fan edition)\b/gi;

interface Word {
  /** As the shop wrote it. */
  text: string;
  lc: string;
}

const word = (text: string): Word => ({ text, lc: text.toLowerCase() });

/**
 * Read a shop's product name. `brandHint` is the brand the shop gives (JSON-LD), used when the name
 * starts with neither a brand nor a series word. Returns null when it isn't a phone we can place.
 */
export function parsePhoneName(raw: string, brandHint?: string | null): ParsedPhoneName | null {
  let s = raw
    .normalize('NFKC')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|['’]/g, '')
    .replace(/[‐-―]/g, '-')
    .trim();

  const lower = s.toLowerCase();
  const kind: PhoneKind | null = /\bun-?official\b/.test(lower) ? 'unofficial' : /\bofficial\b/.test(lower) ? 'official' : null;
  s = s.replace(/\bun-?official\b|\bofficial\b/gi, ' ');

  let variant: string | null = null;
  for (const re of RAM_STORAGE) {
    const m = re.exec(s);
    const rom = m ? storage(Number(m[2]), m[3]) : null;
    if (m && RAM_GB.has(Number(m[1])) && rom) {
      variant = `${Number(m[1])}/${rom}`;
      s = s.replace(m[0], ' ');
      break;
    }
  }
  if (!variant) {
    const m = STORAGE_ONLY.exec(s);
    const only = m ? storage(Number(m[1]), m[2]) : null;
    if (m && only) {
      variant = only;
      s = s.replace(m[0], ' ');
    }
  }
  s = s.replace(LABELS, ' ').replace(/\+/g, ' plus ');

  // Words: letters and digits (and a decimal point, as in "Nokia 3.4"). "Reno15" becomes "Reno 15" (a word
  // of three or more letters runs into a number), but "A57", "X6e" and "15T" stay whole: there the letters
  // are part of the model number.
  const words = s
    .replace(/(\d)\.(\d)/g, '$1\u2024$2')
    .replace(/[^A-Za-z0-9\u2024]+/g, ' ')
    .replace(/\b([A-Za-z]{3,})(\d)/g, '$1 $2')
    .replace(/\u2024/g, '.')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word);
  if (words.length === 0) return null;
  const lcs = () => words.map((w) => w.lc).join(' ');
  if (words.some((w) => NOT_A_PHONE.has(w.lc)) && !PHONE_PHRASES.some((re) => re.test(lcs()))) return null;

  // Brand: the first word ("one plus" is one), else the shop's brand field.
  if (words[0]!.lc === 'one' && words[1]?.lc === 'plus') words.splice(0, 2, word('OnePlus'));
  let brand = BRAND_BY_WORD.get(words[0]!.lc);
  // "Vivo iQOO Z10", "Huawei Honor X9": the second word is another brand's own name.
  const second = BRAND_BY_WORD.get(words[1]?.lc ?? '');
  if (brand && second && second !== brand && words[1]!.lc === second.words[0]) {
    words.shift();
    brand = second;
  }
  if (!brand && brandHint) {
    brand = BRAND_BY_WORD.get(brandHint.toLowerCase().replace(/[^a-z]/g, ''));
    if (brand) words.unshift(word(brand.name));
  }
  if (!brand) return null;

  // Canonical start: "Samsung Galaxy …", "iPhone …", "Redmi …" (no "Xiaomi"), "Google Pixel …".
  const own = brand.words[0]!;
  if (words[0]!.lc === own && brand.standalone?.includes(words[1]?.lc ?? '')) words.shift();
  if (words[0]!.lc !== own && !brand.standalone?.includes(words[0]!.lc)) words.unshift(word(brand.name));
  if (brand.id === 'samsung' && words[1]?.lc !== 'galaxy') words.splice(1, 0, word('Galaxy'));
  if (words[0]!.lc === 'xiaomi' && words[1]?.lc === 'mi') words.splice(1, 1);
  while (words.length > 2 && COLOURS.has(words.at(-1)!.lc)) words.pop();
  const network = (words.find((w) => w.lc === '5g' || w.lc === '4g')?.lc ?? null) as '5g' | '4g' | null;
  const model = words.filter((w) => w.lc !== '5g' && w.lc !== '4g').map((w) => w.lc);
  if (model.length < 2) return null;
  if (brand.phone && !brand.phone.test(model.join(' '))) return null;

  return { key: model.join(''), network, brand: brand.id, name: displayName(words, brand), variant, kind };
}

const UPPER = new Set(['5g', '4g', 'fe', 'se', 'gt', 'xl', 'cmf', 'rog', 'hmd', 'zte', 'ce', 'hd', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii']);
const CASED: Record<string, string> = { iphone: 'iPhone', iqoo: 'iQOO', oneplus: 'OnePlus', itel: 'itel', redmagic: 'RedMagic' };

/**
 * The name as a person would write it. Shops shout ("HONOR X6b OFFICIAL") or whisper ("pixel 10a"), so
 * plain words are capitalised, but a model number keeps the shop's own letters: X6e, 10a, 15T, C75x.
 */
function displayName(words: readonly Word[], brand: PhoneBrand): string {
  return words
    .map(({ text, lc }, i) => {
      if (i === 0 && lc === brand.words[0]) return brand.name;
      if (CASED[lc]) return CASED[lc];
      if (UPPER.has(lc)) return lc.toUpperCase();
      if (/\d/.test(lc)) return text.charAt(0).toUpperCase() + text.slice(1);
      if (text !== lc && text !== text.toUpperCase()) return text; // mixed case: the brand's own styling
      return lc.charAt(0).toUpperCase() + lc.slice(1);
    })
    .join(' ');
}

/** The URL slug for a model name: "Samsung Galaxy A57 5G" → "samsung-galaxy-a57-5g". */
export const phoneSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A first check on a product URL's last path segment, before its page is fetched (sitemaps list everything a shop sells). */
export const looksLikePhoneSlug = (slug: string): boolean => parsePhoneName(decodeURIComponent(slug).replace(/-/g, ' ')) !== null;

/** One shop's price for a phone model, in /api/phones.json. */
export interface PhoneOffer {
  shop: string;
  url: string;
  /** The shop's own product name. */
  name: string;
  variant: string | null;
  kind: PhoneKind | null;
  /** Taka: the cheapest variant the page lists. */
  price: number;
  /** The dearest variant, when the page gives a range. */
  high: number | null;
  stock: PhoneStock;
  /** ISO times: when the shop's page last confirmed this, and when the price or stock last changed. */
  seen_at: string;
  changed_at: string;
}

export interface PhoneModel {
  key: string;
  /** Fixed when the model is first seen: /mobile-price/<slug>. */
  slug: string;
  name: string;
  brand: string;
  /** Lowest in-stock official price, and lowest in-stock unofficial or unstated one. */
  official: number | null;
  other: number | null;
  /** Shops with it in stock. */
  shops: number;
  /** In stock first, then by price. */
  offers: PhoneOffer[];
  /** Dhaka date the model was first seen. */
  first_seen: string;
}

export interface PhonesResponse {
  generated_at: string;
  models: PhoneModel[];
}

/** One change of a shop's price or stock, in /api/phones/history.json. */
export interface PhoneChange {
  date: string;
  shop: string;
  url: string;
  kind: PhoneKind | null;
  variant: string | null;
  price: number;
  /** The price before (the same as `price` when only the stock changed). */
  previous: number;
  stock: PhoneStock;
  previous_stock: PhoneStock | null;
}

export interface PhoneHistoryResponse {
  generated_at: string;
  /** Per model key: [date, lowest official, lowest other] on the first day and on every day either changed. */
  daily: Record<string, Array<[string, number | null, number | null]>>;
  /** Per model key: price and stock changes at each shop in the last 90 days, newest first (at most 20). */
  changes: Record<string, PhoneChange[]>;
}

/** The cheapest plausible new phone, in taka; anything below is an accessory or a data error. */
export const PHONE_MIN_PRICE = 1000;
export const PHONE_MAX_PRICE = 700_000;
