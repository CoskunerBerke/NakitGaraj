export interface ParsedVehicleMetadata {
  canonicalMake: string;
  canonicalModel: string;
  canonicalVariant: string; // Clean engine or 'UNKNOWN'
  canonicalTrim: string;    // Clean package or ''
  canonicalBodyType: string; // Clean body type or ''
}

const KNOWN_MAKES = [
  'Alfa Romeo', 'Aston Martin', 'Audi', 'BMW', 'Chery', 'Chevrolet', 'Chrysler',
  'Citroen', 'Cupra', 'Dacia', 'Daewoo', 'Daihatsu', 'Dodge', 'DS Automobiles',
  'Fiat', 'Ford', 'Geely', 'Honda', 'Hyundai', 'Infiniti', 'Isuzu', 'Jaguar',
  'Jeep', 'Kia', 'Lada', 'Lancia', 'Land Rover', 'Lexus', 'Maserati', 'Mazda',
  'Mercedes-Benz', 'Mercedes Benz', 'Mercedes', 'MG', 'Mini', 'Mitsubishi',
  'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Proton', 'Renault', 'Rolls-Royce',
  'Rover', 'Saab', 'Seat', 'Skoda', 'Smart', 'SsangYong', 'Subaru', 'Suzuki',
  'Tata', 'Tofaş', 'Toyota', 'Volkswagen', 'Volvo'
];

const KNOWN_BODY_TYPES = [
  'Sedan', 'Hatchback', 'Sportback', 'Station Wagon', 'Avant', 'Touring',
  'Coupe', 'Cabrio', 'Roadster', 'SUV', 'Crossover', 'MPV', 'Pick-up', 'Van',
  'Gran Coupe', 'Gran Turismo', 'Shooting Brake', 'Fastback', 'Liftback'
];

const KNOWN_PACKAGES = [
  'M Sport', 'Sport Line', 'Luxury Line', 'Modern Line', 'First Edition M Sport',
  'First Edition', 'Design Line', 'Ambition', 'Attraction', 'Ambiente', 'S Line',
  'Dynamic', 'Titanium', 'Titanium X', 'Trend', 'Trendline', 'Comfortline', 'Highline',
  'Style', 'Executive', 'Executive Plus', 'Executive Luxury', 'Executive M Sport',
  'Premium', 'Comfort', 'Elegance', 'Distinctive', 'Joy', 'Touch', 'Icon',
  'Pop', 'Popstar', 'Lounge', 'Urban', 'Easy', 'Street', 'Mirror', 'Progressive',
  'AMG Line', 'AMG', 'Avangarde', 'Avantgarde', 'Exclusive', 'Tekna', 'Visia',
  'N-Connecta', 'Platinum', 'Shine', 'Feel', 'Live', 'Cosmo', 'Enjoy', 'Edition'
];

export function cleanText(input: string): string {
  if (!input) return '';
  return input
    .replace(/\.html?/gi, '')
    .replace(/\s*-\s*\d+$/g, '')
    .replace(/sahibinden\.com'da/gi, '')
    .replace(/sahibinden\.com/gi, '')
    .replace(/sahibinden/gi, '')
    .replace(/Fiyatları\s*&\s*Modelleri/gi, '')
    .replace(/Fiyatları/gi, '')
    .replace(/Modelleri/gi, '')
    .replace(/Satılık/gi, '')
    .replace(/2\.El/gi, '')
    .replace(/2\. El/gi, '')
    .replace(/Sıfır Km/gi, '')
    .replace(/Otomobil/gi, '')
    .replace(/Arabalar ve/gi, '')
    .replace(/Arabalar/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCanonicalVehicleMetadata(
  rawMakeInput: string,
  rawModelCellInput: string,
  rawVariantCellInput: string,
  rawTitleInput: string = ''
): ParsedVehicleMetadata {
  const cleanMakeStr = cleanText(rawMakeInput);
  let make = cleanMakeStr;
  for (const km of KNOWN_MAKES) {
    if (cleanMakeStr.toLowerCase().startsWith(km.toLowerCase())) {
      make = km;
      break;
    }
  }

  // 1. Clean Base Model ("Seri" column or rawModelCellInput)
  let rawModelStr = cleanText(rawModelCellInput);

  // Strip Make repetition
  if (make) {
    const makeReg = new RegExp(`^${make}\\s*`, 'i');
    rawModelStr = rawModelStr.replace(makeReg, '').trim();
  }

  // Strip Model repetition (e.g. "A3 A3" -> "A3", "Civic Civic" -> "Civic")
  const modelWords = rawModelStr.split(' ').filter(w => w.length > 0);
  if (modelWords.length >= 2 && modelWords[0].toLowerCase() === modelWords[1].toLowerCase()) {
    modelWords.shift();
    rawModelStr = modelWords.join(' ');
  }

  // Detect Body Type
  const fullText = `${rawModelCellInput} ${rawVariantCellInput} ${rawTitleInput}`;
  let canonicalBodyType = '';
  for (const bt of KNOWN_BODY_TYPES) {
    const btReg = new RegExp(`\\b${bt}\\b`, 'i');
    if (btReg.test(fullText)) {
      canonicalBodyType = bt;
      break;
    }
  }

  // Detect Package
  let canonicalTrim = '';
  for (const pkg of KNOWN_PACKAGES) {
    const pkgReg = new RegExp(`\\b${pkg}\\b`, 'i');
    if (pkgReg.test(fullText)) {
      canonicalTrim = pkg;
      break;
    }
  }

  // Strip body types & packages & engines from base model string
  let cleanModelName = rawModelStr;

  // Specific brand rules for clean base model
  const upperMake = make.toUpperCase();
  if (upperMake === 'AUDI') {
    const m = cleanModelName.match(/^(A[1-8]|Q[2-8]|TT|R8|80 Serisi|100 Serisi|200 Serisi)/i);
    if (m) cleanModelName = m[1].toUpperCase();
  } else if (upperMake === 'ALFA ROMEO') {
    const m = cleanModelName.match(/^(147|156|159|Giulietta|MiTo|Stelvio|Tonale|Giulia|GT|Brera|Spider)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'FORD') {
    const m = cleanModelName.match(/^(Focus|Fiesta|Mondeo|Kuga|Puma|EcoSport|C-Max|S-Max|Mustang|Ranger|Tourneo Courier|Transit Courier|Tourneo Connect|Transit Connect|Tourneo Custom|Transit Custom|Transit|Ka|Fusion|Taunus|Escort|Sierra|Granada)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'BMW') {
    const m = cleanModelName.match(/^([1-8] Serisi|M[2-8]|X[1-7]|Z[1-4])/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'MERCEDES-BENZ' || upperMake === 'MERCEDES BENZ' || upperMake === 'MERCEDES') {
    const m = cleanModelName.match(/^([A-Z]-Serisi|[A-Z]-Class|CLA|CLS|GLA|GLB|GLC|GLE|GLS|SLK|SLC|SL|AMG GT)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'HONDA') {
    const m = cleanModelName.match(/^(Civic|Accord|CR-V|HR-V|Jazz|City|S2000|NSX|Prelude|Legend|Integra)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'VOLKSWAGEN' || upperMake === 'VW') {
    const m = cleanModelName.match(/^(Golf|Passat|Polo|Tiguan|Touareg|T-Roc|Taigo|Arteon|Scirocco|Jetta|Bora|Caddy|Amarok|Transporter|Multivan|Caravelle|Beetle|Lupo|Fox)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'RENAULT') {
    const m = cleanModelName.match(/^(Clio|Megane|Symbol|Fluence|Kadjar|Captur|Koleos|Talisman|Scenic|Espace|Laguna|Latitude|Modus|Twingo|Kangoo|Master|Trafic)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'FIAT') {
    const m = cleanModelName.match(/^(Egea|Linea|Punto|Panda|500|500L|500X|Doblo|Fiorino|Ducato|Bravo|Stilo|Palio|Siena|Albea|Tempra|Tipo|Uno|Marea)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'TOYOTA') {
    const m = cleanModelName.match(/^(Corolla|Yaris|Auris|C-HR|RAV4|Avensis|Camry|Hilux|Land Cruiser|Prius|Verso|Aygo)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'HYUNDAI') {
    const m = cleanModelName.match(/^(i10|i20|i30|i40|Elantra|Tucson|Santa Fe|Kona|Bayon|Accent|Accent Blue|Accent Era|Getz|Sonata|Matrix)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'OPEL') {
    const m = cleanModelName.match(/^(Astra|Corsa|Insignia|Mokka|Crossland|Grandland|Vectra|Zafira|Meriva|Combo|Vivaro|Movano|Adam)/i);
    if (m) cleanModelName = m[1];
  } else if (upperMake === 'PEUGEOT') {
    const m = cleanModelName.match(/^(206|207|208|301|307|308|407|508|2008|3008|5008|Rifter|Partner|Expert|Boxer)/i);
    if (m) cleanModelName = m[1];
  }

  // Generic cleaning if not matched by specific brand regex
  if (cleanModelName === rawModelStr) {
    // Strip engine displacement like 1.4, 1.5, 2.0
    cleanModelName = cleanModelName.replace(/\b\d\.\d[A-Za-z]*\b/gi, '').trim();
    // Strip body types from model
    for (const bt of KNOWN_BODY_TYPES) {
      cleanModelName = cleanModelName.replace(new RegExp(`\\b${bt}\\b`, 'gi'), '').trim();
    }
    // Strip packages from model
    for (const pkg of KNOWN_PACKAGES) {
      cleanModelName = cleanModelName.replace(new RegExp(`\\b${pkg}\\b`, 'gi'), '').trim();
    }
  }

  const canonicalModel = cleanModelName || rawModelStr || 'Genel Model';

  // 2. Detect Engine / Variant (`canonicalVariant`)
  let canonicalVariant = '';
  const variantText = `${rawVariantCellInput} ${rawTitleInput}`.trim();

  // Regex patterns for engines
  const enginePatterns = [
    // Audi numeric codes like 30 TDI, 35 TFSI, 40 TDI, 45 TFSI, 50 TDI, 55 TFSI
    /\b(30|35|40|45|50|55)\s*(TFSI|TDI)\b/i,
    // BMW numeric codes like 316i, 318i, 320i, 320d, 520d, 525d, 116i, 118i, 120d, M340i
    /\b(M?[1-8]\d{2}[id])\b/i,
    // Displacement + Tech: 1.5 TFSI, 1.6 TDI, 1.4 TSI, 1.6 TS, 1.6 MultiJet, 1.5 dCi, 1.6 HDi, 1.2 PureTech, 2.0 EcoBoost, 1.3 CDTI, 1.6 CRDi, 1.4 D-4D, 1.6 i-VTEC
    /\b(\d\.\d)\s*(TFSI|TSI|TDI|CDI|CDTI|CRDi|dCi|HDi|BlueHDi|EcoBoost|MultiJet|TwinAir|PureTech|T-Jet|Fire|i-VTEC|VTEC|D-4D|GDI|T-GDI|SkyActiv|e-HDi|TS|JTD|JTDM)\b/i,
    // Pure tech phrases
    /\b(e:HEV|PHEV|Hybrid|Electric|EV|Plug-in)\b/i,
    // Bare displacement if preceded or followed by engine context e.g. "1.4", "1.6", "2.0"
    /\b(\d\.\d)\b/
  ];

  for (const pat of enginePatterns) {
    const match = variantText.match(pat);
    if (match) {
      canonicalVariant = match[0].trim();
      break;
    }
  }

  // Fallback for variant if no engine pattern matched but variantText has a short engine-like string
  if (!canonicalVariant) {
    const cleanVarCell = cleanText(rawVariantCellInput);
    if (cleanVarCell && cleanVarCell.length < 25 && !KNOWN_PACKAGES.some(p => p.toLowerCase() === cleanVarCell.toLowerCase()) && !KNOWN_BODY_TYPES.some(b => b.toLowerCase() === cleanVarCell.toLowerCase())) {
      canonicalVariant = cleanVarCell;
    }
  }

  // If no reliable engine info is found, mark as UNKNOWN
  if (!canonicalVariant || canonicalVariant.trim() === '') {
    canonicalVariant = 'UNKNOWN';
  }

  return {
    canonicalMake: make,
    canonicalModel,
    canonicalVariant,
    canonicalTrim,
    canonicalBodyType,
  };
}
