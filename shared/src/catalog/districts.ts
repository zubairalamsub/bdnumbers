// The 64 districts with their headquarters' coordinates, for prayer times. Coordinates are GeoNames
// populated places (ids kept for reference), looked up via the Open-Meteo geocoder on 2026-10-22.

export type DivisionId = 'dhaka' | 'chattogram' | 'khulna' | 'rajshahi' | 'sylhet' | 'barishal' | 'rangpur' | 'mymensingh';

export const DIVISIONS: Record<DivisionId, { bn: string; en: string }> = {
  dhaka: { bn: 'ঢাকা', en: 'Dhaka' },
  chattogram: { bn: 'চট্টগ্রাম', en: 'Chattogram' },
  khulna: { bn: 'খুলনা', en: 'Khulna' },
  rajshahi: { bn: 'রাজশাহী', en: 'Rajshahi' },
  sylhet: { bn: 'সিলেট', en: 'Sylhet' },
  barishal: { bn: 'বরিশাল', en: 'Barishal' },
  rangpur: { bn: 'রংপুর', en: 'Rangpur' },
  mymensingh: { bn: 'ময়মনসিংহ', en: 'Mymensingh' },
};

export interface District {
  id: string;
  en: string;
  bn: string;
  division: DivisionId;
  lat: number;
  lon: number;
  geonames: number;
}

export const DISTRICTS: readonly District[] = [
  { id: 'dhaka', en: 'Dhaka', bn: 'ঢাকা', division: 'dhaka', lat: 23.7104, lon: 90.4074, geonames: 1185241 },
  { id: 'faridpur', en: 'Faridpur', bn: 'ফরিদপুর', division: 'dhaka', lat: 23.6061, lon: 89.8406, geonames: 1203344 },
  { id: 'gazipur', en: 'Gazipur', bn: 'গাজীপুর', division: 'dhaka', lat: 23.9984, lon: 90.4223, geonames: 1200109 },
  { id: 'gopalganj', en: 'Gopalganj', bn: 'গোপালগঞ্জ', division: 'dhaka', lat: 23.0102, lon: 89.8328, geonames: 7480616 },
  { id: 'kishoreganj', en: 'Kishoreganj', bn: 'কিশোরগঞ্জ', division: 'dhaka', lat: 24.4394, lon: 90.7829, geonames: 1337249 },
  { id: 'madaripur', en: 'Madaripur', bn: 'মাদারীপুর', division: 'dhaka', lat: 23.171, lon: 90.2094, geonames: 1337245 },
  { id: 'manikganj', en: 'Manikganj', bn: 'মানিকগঞ্জ', division: 'dhaka', lat: 23.8577, lon: 90.0096, geonames: 1348441 },
  { id: 'munshiganj', en: 'Munshiganj', bn: 'মুন্সীগঞ্জ', division: 'dhaka', lat: 23.5517, lon: 90.5346, geonames: 1336141 },
  { id: 'narayanganj', en: 'Narayanganj', bn: 'নারায়ণগঞ্জ', division: 'dhaka', lat: 23.6135, lon: 90.503, geonames: 1185155 },
  { id: 'narsingdi', en: 'Narsingdi', bn: 'নরসিংদী', division: 'dhaka', lat: 23.923, lon: 90.7177, geonames: 1185117 },
  { id: 'rajbari', en: 'Rajbari', bn: 'রাজবাড়ী', division: 'dhaka', lat: 23.7573, lon: 89.6463, geonames: 7479432 },
  { id: 'shariatpur', en: 'Shariatpur', bn: 'শরীয়তপুর', division: 'dhaka', lat: 23.2182, lon: 90.3508, geonames: 1191368 },
  { id: 'tangail', en: 'Tangail', bn: 'টাঙ্গাইল', division: 'dhaka', lat: 24.2498, lon: 89.9166, geonames: 1336144 },
  { id: 'bandarban', en: 'Bandarban', bn: 'বান্দরবান', division: 'chattogram', lat: 22.1953, lon: 92.2195, geonames: 1185270 },
  { id: 'brahmanbaria', en: 'Brahmanbaria', bn: 'ব্রাহ্মণবাড়িয়া', division: 'chattogram', lat: 23.9746, lon: 91.1123, geonames: 1336142 },
  { id: 'chandpur', en: 'Chandpur', bn: 'চাঁদপুর', division: 'chattogram', lat: 23.2271, lon: 90.6543, geonames: 1207337 },
  { id: 'chattogram', en: 'Chattogram', bn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.3384, lon: 91.8317, geonames: 1205733 },
  { id: 'coxs-bazar', en: "Cox's Bazar", bn: 'কক্সবাজার', division: 'chattogram', lat: 21.4397, lon: 92.0096, geonames: 1336134 },
  { id: 'cumilla', en: 'Cumilla', bn: 'কুমিল্লা', division: 'chattogram', lat: 23.4619, lon: 91.185, geonames: 1185186 },
  { id: 'feni', en: 'Feni', bn: 'ফেনী', division: 'chattogram', lat: 23.0144, lon: 91.3966, geonames: 1185224 },
  { id: 'khagrachhari', en: 'Khagrachhari', bn: 'খাগড়াছড়ি', division: 'chattogram', lat: 23.1079, lon: 91.9701, geonames: 1185252 },
  { id: 'lakshmipur', en: 'Lakshmipur', bn: 'লক্ষ্মীপুর', division: 'chattogram', lat: 22.9443, lon: 90.83, geonames: 1196292 },
  { id: 'noakhali', en: 'Noakhali', bn: 'নোয়াখালী', division: 'chattogram', lat: 22.8667, lon: 91.1, geonames: 1195434 },
  { id: 'rangamati', en: 'Rangamati', bn: 'রাঙ্গামাটি', division: 'chattogram', lat: 22.6432, lon: 92.1919, geonames: 1336139 },
  { id: 'bagerhat', en: 'Bagerhat', bn: 'বাগেরহাট', division: 'khulna', lat: 22.6566, lon: 89.7912, geonames: 1185281 },
  { id: 'chuadanga', en: 'Chuadanga', bn: 'চুয়াডাঙ্গা', division: 'khulna', lat: 23.643, lon: 88.8529, geonames: 7646420 },
  { id: 'jashore', en: 'Jashore', bn: 'যশোর', division: 'khulna', lat: 23.1697, lon: 89.2137, geonames: 1336140 },
  { id: 'jhenaidah', en: 'Jhenaidah', bn: 'ঝিনাইদহ', division: 'khulna', lat: 23.5425, lon: 89.1749, geonames: 1185202 },
  { id: 'khulna', en: 'Khulna', bn: 'খুলনা', division: 'khulna', lat: 22.8098, lon: 89.5644, geonames: 1336135 },
  { id: 'kushtia', en: 'Kushtia', bn: 'কুষ্টিয়া', division: 'khulna', lat: 23.9028, lon: 89.1194, geonames: 1185191 },
  { id: 'magura', en: 'Magura', bn: 'মাগুরা', division: 'khulna', lat: 23.487, lon: 89.4159, geonames: 7649230 },
  { id: 'meherpur', en: 'Meherpur', bn: 'মেহেরপুর', division: 'khulna', lat: 23.7769, lon: 88.6303, geonames: 8304418 },
  { id: 'narail', en: 'Narail', bn: 'নড়াইল', division: 'khulna', lat: 23.1551, lon: 89.4951, geonames: 1185293 },
  { id: 'satkhira', en: 'Satkhira', bn: 'সাতক্ষীরা', division: 'khulna', lat: 22.7082, lon: 89.0718, geonames: 1185111 },
  { id: 'bogura', en: 'Bogura', bn: 'বগুড়া', division: 'rajshahi', lat: 24.851, lon: 89.3711, geonames: 1337233 },
  { id: 'chapainawabganj', en: 'Chapainawabganj', bn: 'চাঁপাইনবাবগঞ্জ', division: 'rajshahi', lat: 24.5903, lon: 88.2744, geonames: 1337240 },
  { id: 'joypurhat', en: 'Joypurhat', bn: 'জয়পুরহাট', division: 'rajshahi', lat: 25.1015, lon: 89.0273, geonames: 1185206 },
  { id: 'naogaon', en: 'Naogaon', bn: 'নওগাঁ', division: 'rajshahi', lat: 24.8042, lon: 88.9488, geonames: 1192366 },
  { id: 'natore', en: 'Natore', bn: 'নাটোর', division: 'rajshahi', lat: 24.4111, lon: 88.9867, geonames: 7483813 },
  { id: 'pabna', en: 'Pabna', bn: 'পাবনা', division: 'rajshahi', lat: 24.0064, lon: 89.2372, geonames: 1336143 },
  { id: 'rajshahi', en: 'Rajshahi', bn: 'রাজশাহী', division: 'rajshahi', lat: 24.374, lon: 88.6011, geonames: 1185128 },
  { id: 'sirajganj', en: 'Sirajganj', bn: 'সিরাজগঞ্জ', division: 'rajshahi', lat: 24.4577, lon: 89.708, geonames: 1185115 },
  { id: 'habiganj', en: 'Habiganj', bn: 'হবিগঞ্জ', division: 'sylhet', lat: 24.3804, lon: 91.413, geonames: 1185209 },
  { id: 'moulvibazar', en: 'Moulvibazar', bn: 'মৌলভীবাজার', division: 'sylhet', lat: 24.4889, lon: 91.7708, geonames: 1185166 },
  { id: 'sunamganj', en: 'Sunamganj', bn: 'সুনামগঞ্জ', division: 'sylhet', lat: 25.0689, lon: 91.4024, geonames: 1185105 },
  { id: 'sylhet', en: 'Sylhet', bn: 'সিলেট', division: 'sylhet', lat: 24.899, lon: 91.872, geonames: 1185099 },
  { id: 'barguna', en: 'Barguna', bn: 'বরগুনা', division: 'barishal', lat: 22.1567, lon: 90.1176, geonames: 8304391 },
  { id: 'barishal', en: 'Barishal', bn: 'বরিশাল', division: 'barishal', lat: 22.705, lon: 90.3701, geonames: 1336137 },
  { id: 'bhola', en: 'Bhola', bn: 'ভোলা', division: 'barishal', lat: 22.6876, lon: 90.644, geonames: 1336136 },
  { id: 'jhalokati', en: 'Jhalokati', bn: 'ঝালকাঠি', division: 'barishal', lat: 22.6426, lon: 90.2011, geonames: 8432944 },
  { id: 'patuakhali', en: 'Patuakhali', bn: 'পটুয়াখালী', division: 'barishal', lat: 22.3683, lon: 90.3458, geonames: 7646711 },
  { id: 'pirojpur', en: 'Pirojpur', bn: 'পিরোজপুর', division: 'barishal', lat: 22.5797, lon: 89.9752, geonames: 1185138 },
  { id: 'dinajpur', en: 'Dinajpur', bn: 'দিনাজপুর', division: 'rangpur', lat: 25.6274, lon: 88.6378, geonames: 1203891 },
  { id: 'gaibandha', en: 'Gaibandha', bn: 'গাইবান্ধা', division: 'rangpur', lat: 25.3297, lon: 89.5435, geonames: 7921384 },
  { id: 'kurigram', en: 'Kurigram', bn: 'কুড়িগ্রাম', division: 'rangpur', lat: 25.8116, lon: 89.6428, geonames: 7646708 },
  { id: 'lalmonirhat', en: 'Lalmonirhat', bn: 'লালমনিরহাট', division: 'rangpur', lat: 25.9172, lon: 89.4459, geonames: 1185181 },
  { id: 'nilphamari', en: 'Nilphamari', bn: 'নীলফামারী', division: 'rangpur', lat: 25.9417, lon: 88.8467, geonames: 7646714 },
  { id: 'panchagarh', en: 'Panchagarh', bn: 'পঞ্চগড়', division: 'rangpur', lat: 26.3334, lon: 88.5578, geonames: 1185141 },
  { id: 'rangpur', en: 'Rangpur', bn: 'রংপুর', division: 'rangpur', lat: 25.7466, lon: 89.2517, geonames: 1185188 },
  { id: 'thakurgaon', en: 'Thakurgaon', bn: 'ঠাকুরগাঁও', division: 'rangpur', lat: 26.031, lon: 88.4699, geonames: 1185092 },
  { id: 'jamalpur', en: 'Jamalpur', bn: 'জামালপুর', division: 'mymensingh', lat: 24.9197, lon: 89.9481, geonames: 1185106 },
  { id: 'mymensingh', en: 'Mymensingh', bn: 'ময়মনসিংহ', division: 'mymensingh', lat: 24.7564, lon: 90.4065, geonames: 1185162 },
  { id: 'netrokona', en: 'Netrokona', bn: 'নেত্রকোণা', division: 'mymensingh', lat: 24.8835, lon: 90.729, geonames: 1185116 },
  { id: 'sherpur', en: 'Sherpur', bn: 'শেরপুর', division: 'mymensingh', lat: 25.0188, lon: 90.0175, geonames: 1337248 },
];
