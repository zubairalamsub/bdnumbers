// One page per commodity (/market-price/<slug>), grouping TCB's items the way people search for them:
// "চালের দাম" covers coarse, medium, fine and aromatic rice; "পেঁয়াজের দাম" local and imported onion.
import { TCB_ITEMS, type TcbItem } from '@bdnumbers/shared';

export interface Commodity {
  slug: string;
  /** TCB item ids, the most bought first. */
  items: readonly string[];
  bn: string;
  /** Genitive, as in "আজকের পেঁয়াজের দাম". */
  bnOf: string;
  en: string;
}

const c = (slug: string, items: string[], bn: string, bnOf: string, en: string): Commodity => ({ slug, items, bn, bnOf, en });

export const COMMODITIES: readonly Commodity[] = [
  c('rice', ['rice_coarse', 'rice_medium', 'rice_fine', 'rice_aromatic', 'rice_aromatic_packet'], 'চাল', 'চালের', 'Rice'),
  c('atta', ['atta_loose', 'atta_packet'], 'আটা', 'আটার', 'Atta'),
  c('maida', ['maida_loose', 'maida_packet'], 'ময়দা', 'ময়দার', 'Maida'),
  c('soybean-oil', ['soybean_oil_loose', 'soybean_oil_1l', 'soybean_oil_2l', 'soybean_oil_5l'], 'সয়াবিন তেল', 'সয়াবিন তেলের', 'Soybean oil'),
  c('palm-oil', ['palm_oil', 'super_palm_oil'], 'পাম তেল', 'পাম তেলের', 'Palm oil'),
  c('rice-bran-oil', ['rice_bran_oil_5l'], 'রাইস ব্রান তেল', 'রাইস ব্রান তেলের', 'Rice bran oil'),
  c('lentils', ['lentil_bold', 'lentil_medium', 'lentil_small'], 'মসুর ডাল', 'মসুর ডালের', 'Red lentils'),
  c('mung-dal', ['mung_dal'], 'মুগ ডাল', 'মুগ ডালের', 'Mung dal'),
  c('anchor-dal', ['anchor_dal'], 'অ্যাংকর ডাল', 'অ্যাংকর ডালের', 'Anchor dal'),
  c('chickpeas', ['chickpeas'], 'ছোলা', 'ছোলার', 'Chickpeas'),
  c('potato', ['potato'], 'আলু', 'আলুর', 'Potato'),
  c('onion', ['onion_local', 'onion_imported'], 'পেঁয়াজ', 'পেঁয়াজের', 'Onion'),
  c('green-chili', ['green_chili'], 'কাঁচা মরিচ', 'কাঁচা মরিচের', 'Green chili'),
  c('brinjal', ['brinjal'], 'বেগুন', 'বেগুনের', 'Brinjal'),
  c('cucumber', ['cucumber'], 'শসা', 'শসার', 'Cucumber'),
  c('lemon', ['lemon'], 'লেবু', 'লেবুর', 'Lemon'),
  c('garlic', ['garlic_local', 'garlic_imported'], 'রসুন', 'রসুনের', 'Garlic'),
  c('dried-chili', ['dried_chili_local', 'dried_chili_imported'], 'শুকনা মরিচ', 'শুকনা মরিচের', 'Dried chili'),
  c('turmeric', ['turmeric_local', 'turmeric_imported'], 'হলুদ', 'হলুদের', 'Turmeric'),
  c('ginger', ['ginger_local', 'ginger_imported'], 'আদা', 'আদার', 'Ginger'),
  c('cumin', ['cumin'], 'জিরা', 'জিরার', 'Cumin'),
  c('cinnamon', ['cinnamon'], 'দারুচিনি', 'দারুচিনির', 'Cinnamon'),
  c('cloves', ['clove'], 'লবঙ্গ', 'লবঙ্গের', 'Cloves'),
  c('cardamom', ['cardamom'], 'এলাচ', 'এলাচের', 'Cardamom'),
  c('coriander', ['coriander'], 'ধনিয়া', 'ধনিয়ার', 'Coriander seed'),
  c('bay-leaf', ['bay_leaf'], 'তেজপাতা', 'তেজপাতার', 'Bay leaf'),
  c('rui-fish', ['rui'], 'রুই মাছ', 'রুই মাছের', 'Rui fish'),
  c('hilsa', ['hilsa'], 'ইলিশ মাছ', 'ইলিশ মাছের', 'Hilsa'),
  c('beef', ['beef'], 'গরুর মাংস', 'গরুর মাংসের', 'Beef'),
  c('mutton', ['mutton'], 'খাসির মাংস', 'খাসির মাংসের', 'Mutton'),
  c('chicken', ['chicken_broiler', 'chicken_local'], 'মুরগি', 'মুরগির', 'Chicken'),
  c('eggs', ['egg'], 'ডিম', 'ডিমের', 'Eggs'),
  c('milk-powder', ['milk_dano', 'milk_diploma', 'milk_fresh', 'milk_marks'], 'গুঁড়া দুধ', 'গুঁড়া দুধের', 'Milk powder'),
  c('sugar', ['sugar'], 'চিনি', 'চিনির', 'Sugar'),
  c('dates', ['dates'], 'খেজুর', 'খেজুরের', 'Dates'),
  c('salt', ['salt'], 'লবণ', 'লবণের', 'Salt'),
  c('writing-paper', ['writing_paper'], 'লেখার কাগজ', 'লেখার কাগজের', 'Writing paper'),
  c('rod', ['ms_rod_60', 'ms_rod_40'], 'রড', 'রডের', 'MS rod'),
];

export const commodityPath = (c: Commodity) => `/market-price/${c.slug}`;

export function commodityItems(c: Commodity): TcbItem[] {
  return c.items.map((id) => {
    const item = TCB_ITEMS.find((i) => i.id === id);
    if (!item) throw new Error(`commodities: unknown TCB item ${id}`);
    return item;
  });
}

/** The commodity page an item belongs to. */
export function commodityOf(itemId: string): Commodity | undefined {
  return COMMODITIES.find((c) => c.items.includes(itemId));
}
