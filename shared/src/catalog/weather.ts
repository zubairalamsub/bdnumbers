// Weather for Dhaka and the seven other division headquarters, from MET Norway's Locationforecast API
// (CC BY 4.0; commercial use allowed with attribution). Coordinates are GeoNames populated places.

export const MET_API_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
export const MET_CREDIT_URL = 'https://www.met.no/en';

export interface WeatherCity {
  id: string;
  bn: string;
  en: string;
  lat: number;
  lon: number;
  /** GeoNames id the coordinates come from. */
  geonames: number;
}

export const WEATHER_CITIES: readonly WeatherCity[] = [
  { id: 'dhaka', bn: 'ঢাকা', en: 'Dhaka', lat: 23.7104, lon: 90.4074, geonames: 1185241 },
  { id: 'chattogram', bn: 'চট্টগ্রাম', en: 'Chattogram', lat: 22.3384, lon: 91.8317, geonames: 1205733 },
  { id: 'khulna', bn: 'খুলনা', en: 'Khulna', lat: 22.8098, lon: 89.5644, geonames: 1336135 },
  { id: 'rajshahi', bn: 'রাজশাহী', en: 'Rajshahi', lat: 24.374, lon: 88.6011, geonames: 1185128 },
  { id: 'sylhet', bn: 'সিলেট', en: 'Sylhet', lat: 24.899, lon: 91.872, geonames: 1185099 },
  { id: 'barishal', bn: 'বরিশাল', en: 'Barishal', lat: 22.705, lon: 90.3701, geonames: 1336137 },
  { id: 'rangpur', bn: 'রংপুর', en: 'Rangpur', lat: 25.7466, lon: 89.2517, geonames: 1185188 },
  { id: 'mymensingh', bn: 'ময়মনসিংহ', en: 'Mymensingh', lat: 24.7564, lon: 90.4065, geonames: 1185162 },
];

export type WeatherMetric = 'temp' | 'humidity' | 'rain' | 'wind';

export const WEATHER_METRICS: Record<
  WeatherMetric,
  { bn: string; en: string; unit: string; bounds: readonly [number, number] }
> = {
  temp: { bn: 'তাপমাত্রা', en: 'Temperature', unit: '°C', bounds: [-5, 50] },
  humidity: { bn: 'আর্দ্রতা', en: 'Humidity', unit: '%', bounds: [0, 100] },
  rain: { bn: 'বৃষ্টি (পরের ১ ঘণ্টা)', en: 'Rain (next hour)', unit: 'mm', bounds: [0, 300] },
  wind: { bn: 'বাতাস', en: 'Wind', unit: 'km/h', bounds: [0, 300] },
};

/** MET Norway symbol codes → short descriptions (the _day/_night/_polartwilight suffix is dropped). */
const CONDITIONS: Array<[RegExp, { bn: string; en: string; icon: string }]> = [
  [/thunder/, { bn: 'বজ্রসহ বৃষ্টি', en: 'Rain and thunder', icon: '⛈' }],
  [/^heavyrain/, { bn: 'ভারী বৃষ্টি', en: 'Heavy rain', icon: '🌧' }],
  [/^lightrain/, { bn: 'হালকা বৃষ্টি', en: 'Light rain', icon: '🌦' }],
  [/^rain/, { bn: 'বৃষ্টি', en: 'Rain', icon: '🌧' }],
  [/^fog/, { bn: 'কুয়াশা', en: 'Fog', icon: '🌫' }],
  [/^cloudy/, { bn: 'মেঘলা', en: 'Cloudy', icon: '☁' }],
  [/^partlycloudy/, { bn: 'আংশিক মেঘলা', en: 'Partly cloudy', icon: '⛅' }],
  [/^fair/, { bn: 'প্রায় পরিষ্কার', en: 'Mostly clear', icon: '🌤' }],
  [/^clearsky/, { bn: 'পরিষ্কার আকাশ', en: 'Clear sky', icon: '☀' }],
];

export function weatherCondition(symbol: unknown, lang: 'bn' | 'en'): { text: string; icon: string } | null {
  if (typeof symbol !== 'string') return null;
  const found = CONDITIONS.find(([re]) => re.test(symbol))?.[1];
  return found ? { text: found[lang], icon: found.icon } : null;
}
