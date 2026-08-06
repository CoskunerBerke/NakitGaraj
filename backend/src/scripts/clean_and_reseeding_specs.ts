import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ============================================================================
// SAHIBINDEN-STYLE VARIANT MAPPING
// Each brand -> model -> array of sub-model variant names (matching sahibinden.com)
// ============================================================================

const VARIANT_MAP: Record<string, Record<string, string[]>> = {
  // ---- A ----
  'Abarth': {
    '124 Spider': ['124 Spider'],
    '500': ['500', '500C', '595', '595C', '695'],
    'Grande Punto': ['Grande Punto'],
    'Punto Evo': ['Punto Evo'],
  },
  'Acura': {
    'MDX': ['MDX'],
    'RDX': ['RDX'],
    'TL': ['TL'],
    'TSX': ['TSX'],
  },
  'Aion': {
    'S': ['S Plus', 'S Max'],
    'V': ['V Plus'],
    'Y': ['Y', 'Y Plus'],
  },
  'Alfa Romeo': {
    '147': ['147 3 Kapı', '147 5 Kapı'],
    '156': ['156 Sedan', '156 Sportwagon'],
    '159': ['159 Sedan', '159 Sportwagon'],
    '166': ['166'],
    'Brera': ['Brera'],
    'Giulia': ['Giulia', 'Giulia Quadrifoglio'],
    'Giulietta': ['Giulietta'],
    'GT': ['GT'],
    'MiTo': ['MiTo'],
    'Spider': ['Spider'],
    'Stelvio': ['Stelvio', 'Stelvio Quadrifoglio'],
    'Tonale': ['Tonale', 'Tonale PHEV'],
  },
  'Alpine': {
    'A110': ['A110', 'A110 S', 'A110 GT'],
  },
  'Anadol': {
    'A1': ['A1'],
    'A2': ['A2'],
    'STC-16': ['STC-16'],
    'SV-1600': ['SV-1600'],
  },
  'Arora': {
    'M1': ['M1'],
    'S1': ['S1'],
  },
  'Aston Martin': {
    'DB9': ['DB9 Coupe', 'DB9 Volante'],
    'DB11': ['DB11 V8', 'DB11 V12', 'DB11 AMR'],
    'DBS': ['DBS Superleggera', 'DBS Superleggera Volante'],
    'DBX': ['DBX', 'DBX707'],
    'Vanquish': ['Vanquish', 'Vanquish Volante'],
    'Vantage': ['Vantage Coupe', 'Vantage Roadster'],
  },
  'Audi': {
    'A1': ['A1 Sportback'],
    'A3': ['A3 Sedan', 'A3 Sportback'],
    'A4': ['A4 Sedan', 'A4 Avant', 'A4 Allroad'],
    'A5': ['A5 Sportback', 'A5 Coupe', 'A5 Cabrio'],
    'A6': ['A6 Sedan', 'A6 Avant', 'A6 Allroad Quattro'],
    'A7': ['A7 Sportback'],
    'A8': ['A8', 'A8 L'],
    'e-tron': ['e-tron', 'e-tron Sportback', 'e-tron GT'],
    'Q2': ['Q2'],
    'Q3': ['Q3', 'Q3 Sportback'],
    'Q5': ['Q5', 'Q5 Sportback'],
    'Q7': ['Q7'],
    'Q8': ['Q8', 'Q8 e-tron'],
    'R8': ['R8 Coupe', 'R8 Spyder'],
    'RS3': ['RS3 Sedan', 'RS3 Sportback'],
    'RS6': ['RS6 Avant'],
    'S3': ['S3 Sedan', 'S3 Sportback'],
    'TT': ['TT Coupe', 'TT Roadster', 'TTS'],
  },

  // ---- B ----
  'Bentley': {
    'Bentayga': ['Bentayga', 'Bentayga V8', 'Bentayga Speed'],
    'Continental': ['Continental GT', 'Continental GT Convertible', 'Continental Flying Spur'],
    'Flying Spur': ['Flying Spur', 'Flying Spur V8'],
    'Mulsanne': ['Mulsanne', 'Mulsanne Speed'],
  },
  'BMW': {
    '1 Series': ['116i', '118i', '120i', '116d', '118d', '120d', 'M135i'],
    '1 Serisi': ['116i', '118i', '120i', '116d', '118d', '120d', 'M135i'],
    '2 Series': ['218i Gran Coupe', '220i Gran Coupe', '218i Active Tourer', '218d Active Tourer', '220d Gran Coupe', 'M235i Gran Coupe'],
    '2 Serisi': ['218i Gran Coupe', '220i Gran Coupe', '218i Active Tourer', '218d Active Tourer', '220d Gran Coupe', 'M235i Gran Coupe'],
    '3 Series': ['318i Sedan', '320i Sedan', '330i Sedan', '318d Sedan', '320d Sedan', '330d Sedan', '320i Touring', '320d Touring', 'M340i'],
    '3 Serisi': ['318i Sedan', '320i Sedan', '330i Sedan', '318d Sedan', '320d Sedan', '330d Sedan', '320i Touring', '320d Touring', 'M340i'],
    '4 Series': ['420i Gran Coupe', '430i Gran Coupe', '420i Coupe', '430i Coupe', '420d Gran Coupe', 'M440i Gran Coupe'],
    '4 Serisi': ['420i Gran Coupe', '430i Gran Coupe', '420i Coupe', '430i Coupe', '420d Gran Coupe', 'M440i Gran Coupe'],
    '5 Series': ['520i Sedan', '530i Sedan', '520d Sedan', '530d Sedan', '520i Touring', '530i Touring', 'M550i'],
    '5 Serisi': ['520i Sedan', '530i Sedan', '520d Sedan', '530d Sedan', '520i Touring', '530i Touring', 'M550i'],
    '6 Series': ['620d Gran Turismo', '630i Gran Turismo', '640i Gran Coupe'],
    '6 Serisi': ['620d Gran Turismo', '630i Gran Turismo', '640i Gran Coupe'],
    '7 Series': ['730i', '740i', '730d', '740d', '745e', 'M760i'],
    '7 Serisi': ['730i', '740i', '730d', '740d', '745e', 'M760i'],
    '8 Series': ['840i Gran Coupe', '840i Coupe', '840i Cabrio', 'M850i Gran Coupe', 'M850i Coupe'],
    '8 Serisi': ['840i Gran Coupe', '840i Coupe', '840i Cabrio', 'M850i Gran Coupe', 'M850i Coupe'],
    'i3': ['i3', 'i3s'],
    'i4': ['i4 eDrive35', 'i4 eDrive40', 'i4 M50'],
    'i7': ['i7 xDrive60', 'i7 M70'],
    'iX': ['iX xDrive40', 'iX xDrive50', 'iX M60'],
    'iX3': ['iX3'],
    'M2': ['M2', 'M2 Competition'],
    'M3': ['M3 Sedan', 'M3 Touring', 'M3 Competition'],
    'M4': ['M4 Coupe', 'M4 Cabrio', 'M4 Competition'],
    'M5': ['M5 Sedan', 'M5 Competition'],
    'X1': ['X1 sDrive18i', 'X1 sDrive20i', 'X1 xDrive20i', 'X1 sDrive18d', 'X1 xDrive20d'],
    'X2': ['X2 sDrive18i', 'X2 sDrive20i', 'X2 xDrive20i', 'X2 xDrive20d'],
    'X3': ['X3 sDrive20i', 'X3 xDrive20i', 'X3 xDrive30i', 'X3 xDrive20d', 'X3 xDrive30d', 'X3 M40i'],
    'X4': ['X4 xDrive20i', 'X4 xDrive30i', 'X4 xDrive20d', 'X4 M40i'],
    'X5': ['X5 xDrive30i', 'X5 xDrive40i', 'X5 xDrive30d', 'X5 xDrive40d', 'X5 M50i', 'X5 M'],
    'X6': ['X6 xDrive30i', 'X6 xDrive40i', 'X6 xDrive30d', 'X6 M50i'],
    'X7': ['X7 xDrive40i', 'X7 xDrive40d', 'X7 M60i'],
    'Z4': ['Z4 sDrive20i', 'Z4 sDrive30i', 'Z4 M40i'],
  },
  'Buick': {
    'Century': ['Century'],
    'LeSabre': ['LeSabre'],
    'Regal': ['Regal'],
  },
  'BYD': {
    'Atto 3': ['Atto 3 Comfort', 'Atto 3 Design'],
    'Dolphin': ['Dolphin Active', 'Dolphin Boost'],
    'Han': ['Han EV', 'Han DM-i'],
    'Seal': ['Seal Dynamic', 'Seal Premium', 'Seal Performance'],
    'Tang': ['Tang EV', 'Tang DM-i'],
  },

  // ---- C ----
  'Cadillac': {
    'ATS': ['ATS Sedan', 'ATS Coupe'],
    'CTS': ['CTS Sedan'],
    'Deville': ['Deville'],
    'Escalade': ['Escalade', 'Escalade ESV'],
    'Seville': ['Seville STS'],
  },
  'Chery': {
    'Alia': ['Alia'],
    'Arrizo 5': ['Arrizo 5'],
    'Omoda 5': ['Omoda 5'],
    'Tiggo 4 Pro': ['Tiggo 4 Pro'],
    'Tiggo 7 Pro': ['Tiggo 7 Pro', 'Tiggo 7 Pro Max'],
    'Tiggo 8 Pro': ['Tiggo 8 Pro', 'Tiggo 8 Pro Max'],
  },
  'Chevrolet': {
    'Aveo': ['Aveo Sedan', 'Aveo Hatchback'],
    'Camaro': ['Camaro Coupe', 'Camaro Convertible'],
    'Caprice': ['Caprice Classic', 'Caprice Sedan'],
    'Captiva': ['Captiva 2.0 D', 'Captiva LT', 'Captiva High Park'],
    'Cavalier': ['Cavalier'],
    'Celebrity': ['Celebrity'],
    'Corsica': ['Corsica'],
    'Corvette': ['Corvette Stingray', 'Corvette Z06', 'Corvette Coupe', 'Corvette Convertible'],
    'Cruze': ['Cruze Sedan', 'Cruze Hatchback', 'Cruze Station Wagon'],
    'Epica': ['Epica 2.0 D', 'Epica 2.0 LT'],
    'Evanda': ['Evanda CDX'],
    'Geo Storm': ['Geo Storm'],
    'Impala': ['Impala SS', 'Impala Sedan'],
    'Kalos': ['Kalos Sedan', 'Kalos Hatchback'],
    'Lacetti': ['Lacetti Sedan', 'Lacetti Hatchback', 'Lacetti Station Wagon'],
    'Lumina': ['Lumina APV', 'Lumina Sedan'],
    'Monte Carlo': ['Monte Carlo SS'],
    'Nubira': ['Nubira Sedan', 'Nubira Station Wagon'],
    'Rezzo': ['Rezzo SX', 'Rezzo CDX'],
    'Spark': ['Spark LS', 'Spark LT'],
    'Suburban': ['Suburban LTZ'],
    'Tahoe': ['Tahoe LT', 'Tahoe LTZ'],
    'Tracker': ['Tracker'],
    'Trailblazer': ['Trailblazer LT'],
    'Traverse': ['Traverse LTZ'],
    'Trax': ['Trax LS', 'Trax LT'],
  },
  'Chrysler': {
    '300C': ['300C Sedan', '300C Touring'],
    'Neon': ['Neon'],
    'PT Cruiser': ['PT Cruiser', 'PT Cruiser Cabrio'],
    'Sebring': ['Sebring Sedan', 'Sebring Cabrio'],
  },
  'Citroen': {
    'Berlingo': ['Berlingo Multispace', 'Berlingo Van'],
    'C-Elysee': ['C-Elysee'],
    'C1': ['C1'],
    'C2': ['C2'],
    'C3': ['C3', 'C3 Aircross', 'C3 Picasso'],
    'C4': ['C4', 'C4 Cactus', 'C4 Picasso', 'C4 Grand Picasso', 'C4 X'],
    'C5': ['C5 Sedan', 'C5 Tourer', 'C5 Aircross', 'C5 X'],
    'DS3': ['DS3'],
    'DS4': ['DS4', 'DS4 Crossback'],
    'DS5': ['DS5'],
    'Nemo': ['Nemo Multispace'],
    'Xsara': ['Xsara Picasso'],
  },
  'Cupra': {
    'Ateca': ['Ateca'],
    'Born': ['Born'],
    'Formentor': ['Formentor'],
    'Leon': ['Leon', 'Leon Sportstourer'],
  },

  // ---- D ----
  'Dacia': {
    'Dokker': ['Dokker', 'Dokker Stepway'],
    'Duster': ['Duster', 'Duster 4x4'],
    'Jogger': ['Jogger'],
    'Logan': ['Logan Sedan', 'Logan MCV'],
    'Lodgy': ['Lodgy'],
    'Sandero': ['Sandero', 'Sandero Stepway'],
    'Spring': ['Spring Electric'],
  },
  'Daewoo': {
    'Lanos': ['Lanos Sedan', 'Lanos Hatchback'],
    'Matiz': ['Matiz'],
    'Nexia': ['Nexia'],
    'Nubira': ['Nubira Sedan', 'Nubira Station Wagon'],
    'Tacuma': ['Tacuma'],
  },
  'Daihatsu': {
    'Copen': ['Copen'],
    'Cuore': ['Cuore'],
    'Materia': ['Materia'],
    'Sirion': ['Sirion'],
    'Terios': ['Terios'],
    'YRV': ['YRV'],
  },
  'Dodge': {
    'Avenger': ['Avenger'],
    'Caliber': ['Caliber'],
    'Challenger': ['Challenger SXT', 'Challenger R/T', 'Challenger SRT'],
    'Charger': ['Charger SXT', 'Charger R/T', 'Charger SRT'],
    'Neon': ['Neon'],
  },
  'DS Automobiles': {
    'DS 3': ['DS 3', 'DS 3 Crossback'],
    'DS 4': ['DS 4'],
    'DS 5': ['DS 5'],
    'DS 7 Crossback': ['DS 7 Crossback'],
    'DS 9': ['DS 9'],
  },

  // ---- E ----
  'Eagle': {
    'Talon': ['Talon TSi', 'Talon TSi AWD'],
  },

  // ---- F ----
  'Ferrari': {
    '360': ['360 Modena', '360 Spider'],
    '458': ['458 Italia', '458 Spider', '458 Speciale'],
    '488': ['488 GTB', '488 Spider', '488 Pista'],
    '599': ['599 GTB Fiorano', '599 GTO'],
    '812': ['812 Superfast', '812 GTS', '812 Competizione'],
    'F430': ['F430', 'F430 Spider', 'F430 Scuderia'],
    'F8': ['F8 Tributo', 'F8 Spider'],
    'Portofino': ['Portofino', 'Portofino M'],
    'Roma': ['Roma', 'Roma Spider'],
    'SF90': ['SF90 Stradale', 'SF90 Spider'],
  },
  'Fiat': {
    '500': ['500', '500C', '500X', '500L', '500e'],
    'Bravo': ['Bravo'],
    'Doblo': ['Doblo Combi', 'Doblo Panorama', 'Doblo Cargo'],
    'Egea': ['Egea Sedan', 'Egea Hatchback', 'Egea Cross', 'Egea Station Wagon'],
    'Fiorino': ['Fiorino Combi', 'Fiorino Cargo'],
    'Linea': ['Linea'],
    'Palio': ['Palio'],
    'Panda': ['Panda', 'Panda Cross', 'Panda 4x4'],
    'Punto': ['Punto', 'Grande Punto', 'Punto Evo'],
    'Tipo': ['Tipo Sedan', 'Tipo Hatchback', 'Tipo Station Wagon', 'Tipo Cross'],
  },
  'Ford': {
    'B-Max': ['B-Max'],
    'C-Max': ['C-Max', 'Grand C-Max'],
    'Courier': ['Tourneo Courier', 'Transit Courier'],
    'EcoSport': ['EcoSport'],
    'Fiesta': ['Fiesta', 'Fiesta ST'],
    'Focus': ['Focus Sedan', 'Focus Hatchback', 'Focus Station Wagon', 'Focus Active', 'Focus ST'],
    'Fusion': ['Fusion'],
    'Galaxy': ['Galaxy'],
    'Ka': ['Ka', 'Ka+'],
    'Kuga': ['Kuga', 'Kuga PHEV'],
    'Mondeo': ['Mondeo Sedan', 'Mondeo Station Wagon'],
    'Mustang': ['Mustang Coupe', 'Mustang Cabrio', 'Mustang Mach-E'],
    'Puma': ['Puma', 'Puma ST'],
    'Ranger': ['Ranger', 'Ranger Raptor', 'Ranger Wildtrak'],
    'S-Max': ['S-Max'],
    'Tourneo Connect': ['Tourneo Connect'],
    'Tourneo Custom': ['Tourneo Custom'],
  },

  // ---- G ----
  'Geely': {
    'CK': ['CK'],
    'Echo': ['Echo'],
    'Emgrand': ['Emgrand'],
  },

  // ---- H ----
  'Honda': {
    'Accord': ['Accord Sedan', 'Accord Tourer'],
    'City': ['City'],
    'Civic': ['Civic Sedan', 'Civic Hatchback', 'Civic Type R'],
    'CR-V': ['CR-V', 'CR-V Hybrid'],
    'CR-Z': ['CR-Z'],
    'HR-V': ['HR-V', 'HR-V e:HEV'],
    'Jazz': ['Jazz', 'Jazz Hybrid'],
    'ZR-V': ['ZR-V', 'ZR-V e:HEV'],
  },
  'Hyundai': {
    'Accent': ['Accent Sedan', 'Accent Era', 'Accent Blue'],
    'Bayon': ['Bayon'],
    'Elantra': ['Elantra Sedan'],
    'Getz': ['Getz'],
    'i10': ['i10'],
    'i20': ['i20', 'i20 Active'],
    'i30': ['i30 Hatchback', 'i30 Fastback', 'i30 Wagon', 'i30 N'],
    'Ioniq 5': ['Ioniq 5 Standard Range', 'Ioniq 5 Long Range', 'Ioniq 5 Long Range AWD'],
    'Ioniq 6': ['Ioniq 6 Long Range', 'Ioniq 6 Long Range AWD'],
    'Kona': ['Kona', 'Kona Hybrid', 'Kona Electric'],
    'Santa Fe': ['Santa Fe', 'Santa Fe Hybrid'],
    'Tucson': ['Tucson', 'Tucson Hybrid', 'Tucson PHEV'],
    'ix35': ['ix35'],
  },

  // ---- I ----
  'Ikco': {
    'Samand': ['Samand LX', 'Samand EL'],
  },
  'Infiniti': {
    'FX35': ['FX35'],
    'G35': ['G35 Sedan', 'G35 Coupe'],
    'G37': ['G37 Sedan', 'G37 Coupe'],
    'Q30': ['Q30'],
    'Q50': ['Q50', 'Q50 Hybrid'],
    'QX70': ['QX70'],
  },

  // ---- J ----
  'Jaguar': {
    'E-Pace': ['E-Pace'],
    'F-Pace': ['F-Pace', 'F-Pace SVR'],
    'F-Type': ['F-Type Coupe', 'F-Type Cabrio'],
    'I-Pace': ['I-Pace'],
    'XE': ['XE Sedan'],
    'XF': ['XF Sedan', 'XF Sportbrake'],
    'XJ': ['XJ', 'XJ Long'],
    'XK': ['XK Coupe', 'XK Cabrio'],
  },
  'Jeep': {
    'Cherokee': ['Cherokee'],
    'Commander': ['Commander'],
    'Compass': ['Compass', 'Compass 4xe'],
    'Grand Cherokee': ['Grand Cherokee', 'Grand Cherokee L', 'Grand Cherokee 4xe'],
    'Renegade': ['Renegade', 'Renegade 4xe'],
    'Wrangler': ['Wrangler', 'Wrangler Unlimited', 'Wrangler 4xe'],
  },
  'Jiayuan': {
    'City Spirit': ['City Spirit'],
  },
  'Joyce': {
    'EV': ['EV'],
  },

  // ---- K ----
  'Kia': {
    'Carnival': ['Carnival'],
    'Ceed': ['Ceed Hatchback', 'Ceed SW', 'ProCeed', 'Ceed GT'],
    'Cerato': ['Cerato Sedan', 'Cerato Koup'],
    'EV6': ['EV6 Standard Range', 'EV6 Long Range', 'EV6 Long Range AWD', 'EV6 GT'],
    'Niro': ['Niro Hybrid', 'Niro PHEV', 'Niro EV'],
    'Optima': ['Optima Sedan'],
    'Picanto': ['Picanto'],
    'Rio': ['Rio Sedan', 'Rio Hatchback'],
    'Seltos': ['Seltos'],
    'Sorento': ['Sorento', 'Sorento Hybrid', 'Sorento PHEV'],
    'Soul': ['Soul'],
    'Sportage': ['Sportage', 'Sportage Hybrid', 'Sportage PHEV'],
    'Stinger': ['Stinger GT-Line', 'Stinger GT'],
    'Stonic': ['Stonic'],
    'Venga': ['Venga'],
    'XCeed': ['XCeed', 'XCeed PHEV'],
  },

  // ---- L ----
  'Lancia': {
    'Delta': ['Delta'],
    'Thema': ['Thema'],
    'Ypsilon': ['Ypsilon'],
  },
  'Land Rover': {
    'Defender': ['Defender 90', 'Defender 110', 'Defender 130'],
    'Discovery': ['Discovery', 'Discovery Sport'],
    'Freelander': ['Freelander 2'],
    'Range Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque'],
  },
  'Lexus': {
    'ES': ['ES 300h'],
    'IS': ['IS 200t', 'IS 300', 'IS 300h'],
    'LS': ['LS 500', 'LS 500h'],
    'NX': ['NX 200t', 'NX 250', 'NX 300h', 'NX 350h', 'NX 450h+'],
    'RX': ['RX 300', 'RX 350', 'RX 350h', 'RX 450h', 'RX 500h'],
  },
  'Lincoln': {
    'Aviator': ['Aviator'],
    'Navigator': ['Navigator', 'Navigator L'],
    'Town Car': ['Town Car'],
  },
  'Lotus': {
    'Elise': ['Elise', 'Elise Sport'],
    'Emira': ['Emira V6', 'Emira i4'],
    'Evora': ['Evora', 'Evora GT'],
    'Exige': ['Exige S', 'Exige Sport'],
  },

  // ---- M ----
  'Maserati': {
    'Ghibli': ['Ghibli', 'Ghibli S', 'Ghibli Trofeo'],
    'GranCabrio': ['GranCabrio', 'GranCabrio Sport'],
    'GranTurismo': ['GranTurismo', 'GranTurismo Sport', 'GranTurismo MC'],
    'Grecale': ['Grecale GT', 'Grecale Modena', 'Grecale Trofeo'],
    'Levante': ['Levante', 'Levante S', 'Levante Trofeo'],
    'MC20': ['MC20', 'MC20 Cielo'],
    'Quattroporte': ['Quattroporte', 'Quattroporte S', 'Quattroporte Trofeo'],
  },
  'Mazda': {
    '2': ['2'],
    '3': ['3 Sedan', '3 Hatchback'],
    '5': ['5'],
    '6': ['6 Sedan', '6 Station Wagon'],
    'CX-3': ['CX-3'],
    'CX-30': ['CX-30'],
    'CX-5': ['CX-5'],
    'CX-60': ['CX-60', 'CX-60 PHEV'],
    'CX-9': ['CX-9'],
    'MX-30': ['MX-30', 'MX-30 R-EV'],
    'MX-5': ['MX-5', 'MX-5 RF'],
    'RX-8': ['RX-8'],
  },
  'McLaren': {
    '570S': ['570S Coupe', '570S Spider', '570GT'],
    '720S': ['720S Coupe', '720S Spider'],
    'Artura': ['Artura'],
    'GT': ['GT'],
  },
  'Mercedes-Benz': {
    'A-Class': ['A 180', 'A 200', 'A 250', 'A 180 d', 'A 200 d', 'A 35 AMG', 'A 45 AMG'],
    'A Serisi': ['A 180', 'A 200', 'A 250', 'A 180 d', 'A 200 d', 'A 35 AMG', 'A 45 AMG'],
    'AMG GT': ['AMG GT Coupe', 'AMG GT Roadster', 'AMG GT 4-Door', 'AMG GT R', 'AMG GT S'],
    'B-Class': ['B 180', 'B 200', 'B 180 d'],
    'B Serisi': ['B 180', 'B 200', 'B 180 d'],
    'C-Class': ['C 180 Sedan', 'C 200 Sedan', 'C 300 Sedan', 'C 180 d Sedan', 'C 200 d Sedan', 'C 220 d Sedan', 'C 180 Coupe', 'C 200 Coupe', 'C 300 Coupe', 'C 200 Estate', 'C 220 d Estate', 'C 43 AMG', 'C 63 AMG'],
    'C Serisi': ['C 180 Sedan', 'C 200 Sedan', 'C 300 Sedan', 'C 180 d Sedan', 'C 200 d Sedan', 'C 220 d Sedan', 'C 180 Coupe', 'C 200 Coupe', 'C 300 Coupe', 'C 200 Estate', 'C 220 d Estate', 'C 43 AMG', 'C 63 AMG'],
    'CLA': ['CLA 180', 'CLA 200', 'CLA 200 d', 'CLA 250', 'CLA 180 Shooting Brake', 'CLA 200 Shooting Brake', 'CLA 35 AMG', 'CLA 45 AMG'],
    'CLS': ['CLS 350', 'CLS 350 d', 'CLS 400 d', 'CLS 450', 'CLS 53 AMG'],
    'E-Class': ['E 180 Sedan', 'E 200 Sedan', 'E 300 Sedan', 'E 200 d Sedan', 'E 220 d Sedan', 'E 200 Coupe', 'E 300 Coupe', 'E 200 Cabrio', 'E 300 Cabrio', 'E 200 Estate', 'E 220 d Estate', 'E 300 All-Terrain', 'E 53 AMG', 'E 63 AMG'],
    'E Serisi': ['E 180 Sedan', 'E 200 Sedan', 'E 300 Sedan', 'E 200 d Sedan', 'E 220 d Sedan', 'E 200 Coupe', 'E 300 Coupe', 'E 200 Cabrio', 'E 300 Cabrio', 'E 200 Estate', 'E 220 d Estate', 'E 300 All-Terrain', 'E 53 AMG', 'E 63 AMG'],
    'EQA': ['EQA 250', 'EQA 250+', 'EQA 300 4MATIC', 'EQA 350 4MATIC'],
    'EQB': ['EQB 250', 'EQB 250+', 'EQB 300 4MATIC', 'EQB 350 4MATIC'],
    'EQC': ['EQC 400 4MATIC'],
    'EQE': ['EQE 300 Sedan', 'EQE 350+ Sedan', 'EQE 350 4MATIC SUV', 'EQE 500 4MATIC SUV', 'EQE 43 AMG'],
    'EQS': ['EQS 450+ Sedan', 'EQS 580 4MATIC Sedan', 'EQS 450 4MATIC SUV', 'EQS 580 4MATIC SUV', 'EQS 53 AMG'],
    'G-Class': ['G 350 d', 'G 400 d', 'G 500', 'G 63 AMG'],
    'G Serisi': ['G 350 d', 'G 400 d', 'G 500', 'G 63 AMG'],
    'GLA': ['GLA 200', 'GLA 250', 'GLA 200 d', 'GLA 35 AMG', 'GLA 45 AMG'],
    'GLB': ['GLB 200', 'GLB 200 d', 'GLB 250', 'GLB 35 AMG'],
    'GLC': ['GLC 200', 'GLC 300', 'GLC 200 d', 'GLC 220 d', 'GLC 300 d', 'GLC 200 Coupe', 'GLC 300 Coupe', 'GLC 220 d Coupe', 'GLC 43 AMG', 'GLC 63 AMG'],
    'GLE': ['GLE 300 d', 'GLE 350 d', 'GLE 400 d', 'GLE 450', 'GLE 350 d Coupe', 'GLE 400 d Coupe', 'GLE 450 Coupe', 'GLE 53 AMG', 'GLE 63 AMG'],
    'GLS': ['GLS 400 d', 'GLS 450', 'GLS 580', 'GLS 63 AMG'],
    'S-Class': ['S 350 d', 'S 400 d', 'S 450', 'S 500', 'S 580', 'S 63 AMG', 'S 680 Maybach'],
    'S Serisi': ['S 350 d', 'S 400 d', 'S 450', 'S 500', 'S 580', 'S 63 AMG', 'S 680 Maybach'],
    'SL': ['SL 43', 'SL 55 AMG', 'SL 63 AMG'],
    'SLC': ['SLC 180', 'SLC 200', 'SLC 300', 'SLC 43 AMG'],
    'V Serisi': ['V 200 d', 'V 220 d', 'V 250 d', 'V 300 d'],
    'V-Class': ['V 200 d', 'V 220 d', 'V 250 d', 'V 300 d'],
    'Vito': ['Vito Tourer'],
  },
  'MG': {
    '3': ['3'],
    '4': ['4 Standard Range', '4 Long Range', '4 XPOWER'],
    '5': ['5 EV'],
    'HS': ['HS', 'HS PHEV'],
    'Marvel R': ['Marvel R'],
    'ZS': ['ZS', 'ZS EV'],
  },
  'Mini': {
    'Clubman': ['Clubman Cooper', 'Clubman Cooper S', 'Clubman Cooper D', 'Clubman JCW'],
    'Cooper': ['Cooper 3 Kapı', 'Cooper S 3 Kapı', 'Cooper 5 Kapı', 'Cooper S 5 Kapı', 'Cooper SE', 'JCW 3 Kapı'],
    'Countryman': ['Countryman Cooper', 'Countryman Cooper S', 'Countryman Cooper D', 'Countryman Cooper SE', 'Countryman JCW'],
    'Coupe': ['Coupe Cooper S'],
    'Paceman': ['Paceman Cooper', 'Paceman Cooper S'],
    'Roadster': ['Roadster Cooper S'],
  },
  'Mitsubishi': {
    'Carisma': ['Carisma Sedan', 'Carisma Hatchback'],
    'Colt': ['Colt'],
    'Eclipse': ['Eclipse Cross', 'Eclipse Cross PHEV'],
    'Lancer': ['Lancer Sedan', 'Lancer Sportback', 'Lancer Evolution'],
    'Space Star': ['Space Star'],
  },

  // ---- N ----
  'Nissan': {
    '350Z': ['350Z Coupe', '350Z Roadster'],
    '370Z': ['370Z Coupe', '370Z Roadster', '370Z Nismo'],
    'GT-R': ['GT-R', 'GT-R Nismo'],
    'Juke': ['Juke', 'Juke Nismo'],
    'Leaf': ['Leaf', 'Leaf e+'],
    'Micra': ['Micra'],
    'Navara': ['Navara'],
    'Note': ['Note', 'Note e-Power'],
    'Pathfinder': ['Pathfinder'],
    'Primera': ['Primera Sedan', 'Primera Station Wagon'],
    'Pulsar': ['Pulsar'],
    'Qashqai': ['Qashqai', 'Qashqai e-Power'],
    'X-Trail': ['X-Trail', 'X-Trail e-Power', 'X-Trail e-4ORCE'],
  },

  // ---- O ----
  'Opel': {
    'Adam': ['Adam'],
    'Astra': ['Astra Sedan', 'Astra Hatchback', 'Astra Sports Tourer', 'Astra GTC'],
    'Cascada': ['Cascada'],
    'Combo': ['Combo Life'],
    'Corsa': ['Corsa', 'Corsa-e', 'Corsa OPC'],
    'Crossland': ['Crossland', 'Crossland X'],
    'Grandland': ['Grandland', 'Grandland X', 'Grandland PHEV'],
    'Insignia': ['Insignia Grand Sport', 'Insignia Sports Tourer', 'Insignia Country Tourer'],
    'Karl': ['Karl'],
    'Meriva': ['Meriva'],
    'Mokka': ['Mokka', 'Mokka X', 'Mokka-e'],
    'Vectra': ['Vectra Sedan', 'Vectra Station Wagon'],
    'Zafira': ['Zafira', 'Zafira Tourer', 'Zafira Life'],
  },

  // ---- P ----
  'Peugeot': {
    '107': ['107'],
    '2008': ['2008', '2008 GT', 'e-2008'],
    '206': ['206', '206+', '206 CC'],
    '207': ['207', '207 CC', '207 SW'],
    '208': ['208', '208 GT', 'e-208'],
    '3008': ['3008', '3008 GT', '3008 Hybrid', '3008 Hybrid4'],
    '301': ['301'],
    '306': ['306 Sedan', '306 Hatchback', '306 Station Wagon', '306 Cabrio'],
    '307': ['307 Hatchback', '307 CC', '307 SW'],
    '308': ['308 Hatchback', '308 SW', '308 GT', '308 CC'],
    '407': ['407 Sedan', '407 Coupe', '407 SW'],
    '408': ['408'],
    '5008': ['5008', '5008 GT'],
    '508': ['508 Sedan', '508 SW', '508 GT', '508 PSE'],
    'Partner': ['Partner Tepee', 'Rifter'],
    'RCZ': ['RCZ'],
  },
  'Porsche': {
    '718': ['718 Cayman', '718 Boxster', '718 Cayman GT4', '718 Spyder'],
    '911': ['911 Carrera', '911 Carrera S', '911 Carrera 4S', '911 Turbo', '911 Turbo S', '911 GT3', '911 GT3 RS', '911 Targa'],
    'Cayenne': ['Cayenne', 'Cayenne S', 'Cayenne GTS', 'Cayenne Turbo', 'Cayenne Turbo GT', 'Cayenne E-Hybrid', 'Cayenne Coupe'],
    'Macan': ['Macan', 'Macan S', 'Macan GTS', 'Macan Turbo', 'Macan Electric'],
    'Panamera': ['Panamera', 'Panamera 4', 'Panamera GTS', 'Panamera Turbo', 'Panamera Sport Turismo', 'Panamera E-Hybrid'],
    'Taycan': ['Taycan', 'Taycan 4S', 'Taycan GTS', 'Taycan Turbo', 'Taycan Turbo S', 'Taycan Cross Turismo', 'Taycan Sport Turismo'],
  },
  'Proton': {
    'Persona': ['Persona'],
    'Saga': ['Saga'],
    'Wira': ['Wira'],
  },

  // ---- R ----
  'Renault': {
    'Arkana': ['Arkana', 'Arkana E-Tech'],
    'Austral': ['Austral', 'Austral E-Tech'],
    'Captur': ['Captur', 'Captur E-Tech'],
    'Clio': ['Clio', 'Clio Sport Tourer', 'Clio E-Tech'],
    'Fluence': ['Fluence'],
    'Kadjar': ['Kadjar'],
    'Kangoo': ['Kangoo Multix', 'Kangoo Stepway'],
    'Koleos': ['Koleos'],
    'Latitude': ['Latitude'],
    'Megane': ['Megane Sedan', 'Megane Hatchback', 'Megane Sport Tourer', 'Megane E-Tech Electric'],
    'Scenic': ['Scenic', 'Grand Scenic'],
    'Symbol': ['Symbol', 'Symbol Joy'],
    'Talisman': ['Talisman Sedan', 'Talisman Sport Tourer'],
    'Twingo': ['Twingo', 'Twingo E-Tech'],
    'Zoe': ['Zoe'],
  },
  'Rolls-Royce': {
    'Cullinan': ['Cullinan', 'Cullinan Black Badge'],
    'Ghost': ['Ghost', 'Ghost Extended', 'Ghost Black Badge'],
    'Phantom': ['Phantom', 'Phantom Extended'],
    'Wraith': ['Wraith', 'Wraith Black Badge'],
  },
  'Rover': {
    '200': ['200'],
    '25': ['25'],
    '45': ['45'],
    '75': ['75 Sedan', '75 Tourer'],
  },

  // ---- S ----
  'Saab': {
    '9-3': ['9-3 Sedan', '9-3 Cabrio', '9-3 SportCombi'],
    '9-5': ['9-5 Sedan', '9-5 SportCombi'],
  },
  'Seat': {
    'Altea': ['Altea', 'Altea XL'],
    'Arona': ['Arona', 'Arona FR'],
    'Ateca': ['Ateca', 'Ateca FR', 'Ateca Xperience'],
    'Cordoba': ['Cordoba'],
    'Exeo': ['Exeo Sedan', 'Exeo ST'],
    'Ibiza': ['Ibiza', 'Ibiza FR'],
    'Leon': ['Leon Hatchback', 'Leon ST', 'Leon FR', 'Leon Cupra'],
    'Mii': ['Mii', 'Mii Electric'],
    'Tarraco': ['Tarraco', 'Tarraco FR'],
    'Toledo': ['Toledo'],
  },
  'Skoda': {
    'Enyaq': ['Enyaq iV', 'Enyaq iV 80', 'Enyaq iV 80x', 'Enyaq Coupe iV'],
    'Fabia': ['Fabia', 'Fabia Combi', 'Fabia Monte Carlo'],
    'Kamiq': ['Kamiq'],
    'Karoq': ['Karoq', 'Karoq Sportline'],
    'Kodiaq': ['Kodiaq', 'Kodiaq RS', 'Kodiaq Sportline'],
    'Octavia': ['Octavia Sedan', 'Octavia Combi', 'Octavia RS', 'Octavia Scout'],
    'Rapid': ['Rapid', 'Rapid Spaceback'],
    'Roomster': ['Roomster'],
    'Scala': ['Scala', 'Scala Monte Carlo'],
    'Superb': ['Superb Sedan', 'Superb Combi', 'Superb Sportline'],
    'Yeti': ['Yeti', 'Yeti Outdoor'],
  },
  'Smart': {
    'Forfour': ['Forfour', 'Forfour EQ'],
    'Fortwo': ['Fortwo', 'Fortwo Cabrio', 'Fortwo EQ'],
  },
  'Subaru': {
    'BRZ': ['BRZ'],
    'Forester': ['Forester', 'Forester e-BOXER'],
    'Impreza': ['Impreza Sedan', 'Impreza Hatchback', 'Impreza WRX', 'Impreza WRX STI'],
    'Legacy': ['Legacy Sedan', 'Legacy Outback'],
    'Outback': ['Outback'],
    'XV': ['XV', 'XV e-BOXER'],
  },
  'Suzuki': {
    'Alto': ['Alto'],
    'Baleno': ['Baleno'],
    'Celerio': ['Celerio'],
    'Ignis': ['Ignis'],
    'Jimny': ['Jimny'],
    'S-Cross': ['S-Cross', 'S-Cross Hybrid'],
    'SX4': ['SX4', 'SX4 S-Cross'],
    'Swift': ['Swift', 'Swift Sport'],
    'Vitara': ['Vitara', 'Vitara Hybrid'],
  },

  // ---- T ----
  'Tata': {
    'Indica': ['Indica'],
    'Indigo': ['Indigo'],
    'Marina': ['Marina'],
  },
  'Tesla': {
    'Model 3': ['Model 3 Standard Range Plus', 'Model 3 Long Range', 'Model 3 Performance'],
    'Model S': ['Model S Long Range', 'Model S Plaid'],
    'Model X': ['Model X Long Range', 'Model X Plaid'],
    'Model Y': ['Model Y Standard Range', 'Model Y Long Range', 'Model Y Performance'],
  },
  'Tofaş': {
    'Doğan': ['Doğan SLX', 'Doğan SL'],
    'Kartal': ['Kartal SLX', 'Kartal SL'],
    'Murat 124': ['Murat 124'],
    'Murat 131': ['Murat 131'],
    'Serçe': ['Serçe'],
    'Şahin': ['Şahin S', 'Şahin 1.6ie'],
  },
  'Togg': {
    'T10F': ['V1', 'V2'],
    'T10X': ['V1', 'V2'],
  },
  'Toyota': {
    'Auris': ['Auris Hatchback', 'Auris Touring Sports', 'Auris Hybrid'],
    'Avensis': ['Avensis Sedan', 'Avensis Touring Sports'],
    'C-HR': ['C-HR', 'C-HR Hybrid'],
    'Camry': ['Camry', 'Camry Hybrid'],
    'Corolla': ['Corolla Sedan', 'Corolla Hatchback', 'Corolla Touring Sports', 'Corolla Cross', 'Corolla Hybrid'],
    'Hilux': ['Hilux', 'Hilux Adventure', 'Hilux Invincible'],
    'Land Cruiser': ['Land Cruiser', 'Land Cruiser Prado'],
    'Prius': ['Prius', 'Prius+', 'Prius PHEV'],
    'RAV4': ['RAV4', 'RAV4 Hybrid', 'RAV4 PHEV'],
    'Supra': ['Supra 2.0', 'Supra 3.0'],
    'Yaris': ['Yaris', 'Yaris Cross', 'Yaris Hybrid'],
  },

  // ---- V ----
  'Volkswagen': {
    'Arteon': ['Arteon Fastback', 'Arteon Shooting Brake', 'Arteon R'],
    'Caddy': ['Caddy Kombi', 'Caddy Maxi Kombi', 'Caddy Cargo'],
    'CC': ['CC'],
    'Golf': ['Golf Hatchback', 'Golf Variant', 'Golf GTI', 'Golf GTD', 'Golf GTE', 'Golf R'],
    'ID.3': ['ID.3 Pure', 'ID.3 Pro', 'ID.3 Pro S'],
    'ID.4': ['ID.4 Pure', 'ID.4 Pro', 'ID.4 GTX'],
    'ID.5': ['ID.5 Pro', 'ID.5 GTX'],
    'ID.Buzz': ['ID.Buzz', 'ID.Buzz LWB'],
    'Jetta': ['Jetta'],
    'Passat': ['Passat Sedan', 'Passat Variant', 'Passat GTE'],
    'Polo': ['Polo', 'Polo GTI'],
    'Scirocco': ['Scirocco', 'Scirocco R'],
    'T-Cross': ['T-Cross', 'T-Cross Style'],
    'T-Roc': ['T-Roc', 'T-Roc Cabrio', 'T-Roc R'],
    'Tiguan': ['Tiguan', 'Tiguan Allspace', 'Tiguan R', 'Tiguan eHybrid'],
    'Touareg': ['Touareg', 'Touareg R', 'Touareg eHybrid'],
    'Up': ['Up', 'e-Up'],
  },
  'Volvo': {
    'C30': ['C30'],
    'C40': ['C40 Recharge'],
    'C70': ['C70'],
    'S40': ['S40'],
    'S60': ['S60', 'S60 Cross Country', 'S60 Recharge'],
    'S80': ['S80'],
    'S90': ['S90', 'S90 Recharge'],
    'V40': ['V40', 'V40 Cross Country'],
    'V60': ['V60', 'V60 Cross Country', 'V60 Recharge'],
    'V90': ['V90', 'V90 Cross Country', 'V90 Recharge'],
    'XC40': ['XC40', 'XC40 Recharge'],
    'XC60': ['XC60', 'XC60 Recharge'],
    'XC90': ['XC90', 'XC90 Recharge'],
  },
};

// ============================================================================
// ENGINE SPECS DEFAULTS per vehicle class (internal, not shown to user)
// ============================================================================
function getEngineSpecsForVariant(
  brandName: string,
  modelName: string,
  variantName: string
): { engineSize: number; horsepower: number; torque: number; cylinders: number } {
  const lb = brandName.toLowerCase();
  const lm = modelName.toLowerCase();
  const lv = variantName.toLowerCase();

  // Electric
  if (
    lb.includes('tesla') || lb.includes('togg') || lb.includes('aion') ||
    lb.includes('joyce') || lb.includes('jiayuan') ||
    lv.includes('electric') || lv.includes('elektrik') || lv.includes('recharge') ||
    lv.includes('ev') || lv.includes('e-tron') || lv.includes('id.') ||
    lv.includes('ioniq') || lv.includes('leaf') || lv.includes('zoe') ||
    lv.includes('e-208') || lv.includes('e-2008') || lv.includes('e-up') ||
    lv.includes('corsa-e') || lv.includes('mokka-e') || lv.includes('born') ||
    lv.includes('eq ') || lv.includes('eqa') || lv.includes('eqb') || lv.includes('eqc') ||
    lv.includes('eqe') || lv.includes('eqs') || lv.includes('mach-e') ||
    lv.includes('spring') || lv.includes('500e') || lv.includes('ix') ||
    lv.includes('i4 ') || lv.includes('i7 ') || lv.includes('i3') ||
    lv.includes('taycan') || lv.includes('enyaq') || 
    lv.includes('niro ev') || lv.includes('kona electric') || lv.includes('ev6') ||
    (lb.includes('byd') && (lv.includes('atto') || lv.includes('seal') || lv.includes('dolphin') || lv.includes('ev'))) ||
    (lb.includes('mg') && (lv.includes('4 ') || lv.includes('5 ev') || lv.includes('marvel') || lv.includes('zs ev'))) ||
    lv.includes('fortwo eq') || lv.includes('forfour eq') || lv.includes('mii electric') ||
    lv.includes('c40 recharge') || lv.includes('xc40 recharge')
  ) {
    // Differentiate power levels
    if (lv.includes('performance') || lv.includes('plaid') || lv.includes('gt') || lv.includes('m50') || lv.includes('m60') || lv.includes('m70') || lv.includes('turbo s') || lv.includes('xpower') || lv.includes('4orce') || lv.includes('awd') || lv.includes('4matic') || lv.includes('gtx') || lv.includes('v2')) {
      return { engineSize: 0, horsepower: 513, torque: 660, cylinders: 0 };
    }
    return { engineSize: 0, horsepower: 204, torque: 310, cylinders: 0 };
  }

  // Exotic / Super cars
  if (
    lb.includes('ferrari') || lb.includes('lamborghini') || lb.includes('mclaren') ||
    lb.includes('rolls-royce') || lb.includes('bentley') || lb.includes('aston')
  ) {
    if (lv.includes('v12') || lv.includes('812') || lv.includes('phantom') || lv.includes('mulsanne') || lv.includes('gto') || lv.includes('competizione')) {
      return { engineSize: 6496, horsepower: 800, torque: 718, cylinders: 12 };
    }
    return { engineSize: 3982, horsepower: 650, torque: 850, cylinders: 8 };
  }

  // Porsche
  if (lb.includes('porsche')) {
    if (lv.includes('taycan')) {
      return { engineSize: 0, horsepower: lv.includes('turbo') ? 680 : 408, torque: 660, cylinders: 0 };
    }
    if (lv.includes('gt3') || lv.includes('gt4')) {
      return { engineSize: 3996, horsepower: 510, torque: 470, cylinders: 6 };
    }
    if (lv.includes('turbo') || lv.includes('gts')) {
      return { engineSize: 3996, horsepower: 650, torque: 800, cylinders: 8 };
    }
    return { engineSize: 2995, horsepower: 380, torque: 450, cylinders: 6 };
  }

  // Maserati
  if (lb.includes('maserati')) {
    if (lv.includes('trofeo') || lv.includes('mc20')) {
      return { engineSize: 3799, horsepower: 580, torque: 730, cylinders: 8 };
    }
    return { engineSize: 2979, horsepower: 350, torque: 500, cylinders: 6 };
  }

  // Chevrolet Corvette & Camaro & Mustang
  if (lm.includes('corvette') || lv.includes('corvette')) {
    return { engineSize: 6162, horsepower: 495, torque: 637, cylinders: 8 };
  }
  if (lm.includes('camaro') || lv.includes('camaro') || lm.includes('mustang') || lv.includes('mustang')) {
    return { engineSize: 5038, horsepower: 450, torque: 556, cylinders: 8 };
  }

  // Tofaş / Anadol classics
  if (lb.includes('tofaş') || lb.includes('tofas') || lb.includes('anadol')) {
    return { engineSize: 1581, horsepower: 80, torque: 125, cylinders: 4 };
  }

  // AMG models
  if (lm.includes('amg') || lv.includes('amg') || lv.includes('63') || lv.includes('45 amg')) {
    if (lv.includes('63') || lv.includes('gt r') || lv.includes('gt s') || lm.includes('amg gt')) {
      return { engineSize: 3982, horsepower: 585, torque: 800, cylinders: 8 };
    }
    return { engineSize: 1991, horsepower: 421, torque: 500, cylinders: 4 };
  }

  // BMW M cars (M2, M3, M4, M5, M6, M8)
  if (
    lm.includes('m2') || lv.includes('m2') ||
    lm.includes('m3') || lv.includes('m3') ||
    lm.includes('m4') || lv.includes('m4') ||
    lm.includes('m5') || lv.includes('m5') ||
    lm.includes('m6') || lv.includes('m6') ||
    lm.includes('m8') || lv.includes('m8')
  ) {
    if (lm.includes('m5') || lv.includes('m5') || lm.includes('m6') || lv.includes('m6') || lm.includes('m8') || lv.includes('m8')) {
      return { engineSize: 4395, horsepower: 625, torque: 750, cylinders: 8 };
    }
    if (lm.includes('m3') || lv.includes('m3')) {
      return { engineSize: 3999, horsepower: 420, torque: 400, cylinders: 8 };
    }
    return { engineSize: 2993, horsepower: 510, torque: 650, cylinders: 6 };
  }

  // Audi RS models
  if (
    lm.includes('rs3') || lv.includes('rs3') ||
    lm.includes('rs4') || lv.includes('rs4') ||
    lm.includes('rs5') || lv.includes('rs5') ||
    lm.includes('rs6') || lv.includes('rs6') ||
    lm.includes('rs7') || lv.includes('rs7') ||
    lm.includes('rs q8') || lv.includes('rs q8') ||
    lm.includes('r8') || lv.includes('r8')
  ) {
    if (lm.includes('rs6') || lm.includes('rs7') || lm.includes('rs q8') || lm.includes('r8')) {
      return { engineSize: 3996, horsepower: 600, torque: 800, cylinders: 8 };
    }
    return { engineSize: 2894, horsepower: 450, torque: 600, cylinders: 6 };
  }

  // Performance variants
  if (lv.includes('gti') || lv.includes('st ') || lv.includes('type r') || lv.includes('rs') || lv.includes('opc') || lv.includes('nismo') || lv.includes('sport') || lv.includes('cupra') || lv.includes('r-line') || lv.includes('quadrifoglio')) {
    return { engineSize: 1998, horsepower: 300, torque: 400, cylinders: 4 };
  }

  // Hybrid
  if (lv.includes('hybrid') || lv.includes('e-tech') || lv.includes('phev') || lv.includes('e-hybrid') || lv.includes('e:hev') || lv.includes('e-boxer') || lv.includes('e-cvt') || lv.includes('gte') || lv.includes('plug-in') || lv.includes('4xe') || lv.includes('dm-i')) {
    return { engineSize: 1798, horsepower: 185, torque: 290, cylinders: 4 };
  }

  // Economy / Small
  if (
    lv.includes('1.0') || lv.includes('picanto') || lv.includes('up') ||
    lv.includes('matiz') || lv.includes('alto') || lv.includes('celerio') ||
    lv.includes('karl') || lv.includes('i10') || lv.includes('107') ||
    lv.includes('mii') || lv.includes('adam')
  ) {
    return { engineSize: 999, horsepower: 95, torque: 160, cylinders: 3 };
  }

  // Diesel variants  
  if (lv.includes(' d') || lv.includes('tdi') || lv.includes('cdi') || lv.includes('hdi') || lv.includes('dci') || lv.includes('multijet') || lv.includes('d4d') || lv.includes('crdi') || lv.includes('gtd')) {
    return { engineSize: 1968, horsepower: 190, torque: 400, cylinders: 4 };
  }

  // Large engine / V6-V8 sedan/SUV
  if (lv.includes('500') || lv.includes('450') || lv.includes('400') || lv.includes('350') || lv.includes('v8') || lv.includes('v6') || lv.includes('3.0') || lv.includes('escalade') || lv.includes('navigator') || lv.includes('g 500') || lv.includes('touareg')) {
    return { engineSize: 2995, horsepower: 340, torque: 500, cylinders: 6 };
  }

  // Standard petrol (default)
  return { engineSize: 1598, horsepower: 160, torque: 250, cylinders: 4 };
}

// ============================================================================
// Year ranges per brand/model
// ============================================================================
function getYearsForModel(brandName: string, modelName: string): number[] {
  const brand = brandName.toLowerCase();
  const model = modelName.toLowerCase();

  if (brand.includes('tofaş') || brand.includes('tofas')) return [1992, 1995, 1998, 2000, 2001, 2002];
  if (brand.includes('anadol')) return [1972, 1975, 1978, 1981, 1984];
  if (brand.includes('daewoo')) return [1998, 2000, 2002, 2004];
  if (brand.includes('togg')) return [2023, 2024, 2025, 2026];
  if (brand.includes('tesla')) {
    if (model.includes('model y')) return [2020, 2022, 2024, 2025, 2026];
    if (model.includes('model 3')) return [2018, 2020, 2022, 2024, 2025, 2026];
    return [2018, 2020, 2022, 2024, 2025, 2026];
  }
  if (brand.includes('chery')) return [2022, 2023, 2024, 2025, 2026];
  if (brand.includes('cupra')) return [2020, 2022, 2024, 2025, 2026];
  if (brand.includes('byd')) return [2022, 2023, 2024, 2025, 2026];

  // Include full year coverage (2000 to 2026) for complete market availability
  return [2000, 2002, 2004, 2006, 2008, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
}

function getPackagesForVariant(brandName: string, modelName: string, variantName: string): string[] {
  const brand = brandName.toLowerCase();
  const model = modelName.toLowerCase();
  const variant = variantName.toLowerCase();

  if (brand.includes('mercedes')) {
    if (variant.includes('amg') || model.includes('amg')) {
      return ['AMG Performance', 'AMG Dynamic', 'AMG Line', 'Night Package', 'Edition 1', 'Standart'];
    }
    if (model.includes('s serisi') || model.includes('maybach')) {
      return ['Maybach', 'Exclusive', 'AMG Line', 'Standart'];
    }
    if (model.includes('e serisi')) {
      return ['AMG Line', 'Exclusive', 'Avantgarde', 'Edition 1', 'Night Package', 'Standart'];
    }
    return ['AMG Line', 'Avantgarde', 'Selection', 'Fascination', 'Style', 'Night Package', 'Standart'];
  }

  if (brand.includes('bmw')) {
    if (variant.includes('m') || model.includes('m')) {
      return ['M Competition', 'M Sport', 'M Performance', 'First Edition M Sport', 'Standart'];
    }
    if (model.includes('7 serisi') || model.includes('8 serisi')) {
      return ['M Sport', 'Pure Excellence', 'Excellence', 'Standart'];
    }
    return ['M Sport', 'Luxury Line', 'Sport Line', 'Modern Line', 'Executive', 'Standart'];
  }

  if (brand.includes('audi')) {
    if (variant.includes('rs') || variant.includes('r8') || variant.includes('s')) {
      return ['RS Performance', 'S Line', 'Black Edition', 'Dynamic', 'Standart'];
    }
    return ['S Line', 'Advanced', 'Design', 'Sport', 'Dynamic', 'Standart'];
  }

  if (brand.includes('volkswagen') || brand.includes('vw')) {
    if (variant.includes('gti') || variant.includes('gtd') || variant.includes('gte') || variant.includes('r')) {
      return ['R', 'R-Line', 'GTI', 'Performance', 'Standart'];
    }
    if (model.includes('passat') || model.includes('arteon') || model.includes('touareg')) {
      return ['R-Line', 'Elegance', 'Business', 'Comfortline', 'Highline', 'Trendline', 'Standart'];
    }
    return ['R-Line', 'Style', 'Life', 'Impression', 'Highline', 'Comfortline', 'Standart'];
  }

  if (brand.includes('renault')) {
    return ['Esprit Alpine', 'Icon', 'Touch', 'Joy', 'Equilibre', 'Techno', 'Standart'];
  }

  if (brand.includes('fiat')) {
    if (model.includes('egea')) {
      return ['Lounge', 'Urban', 'Easy', 'Cross', 'Mirror', 'Street', 'Limited', 'Standart'];
    }
    return ['Lounge', 'Urban', 'Pop', 'Easy', 'Standart'];
  }

  if (brand.includes('ford')) {
    if (variant.includes('st') || variant.includes('raptor') || variant.includes('wildtrak')) {
      return ['ST-Line', 'Wildtrak', 'Raptor', 'Vignale', 'Standart'];
    }
    return ['Titanium X', 'Titanium', 'ST-Line', 'Vignale', 'Style', 'Trend X', 'Trend', 'Standart'];
  }

  if (brand.includes('opel')) {
    return ['Ultimate', 'GS', 'GS Line', 'Excellence', 'Dynamic', 'Enjoy', 'Edition', 'Essentia', 'Cosmo', 'Standart'];
  }

  if (brand.includes('peugeot')) {
    return ['GT', 'GT Line', 'Allure', 'Active Prime', 'Active', 'Access', 'Standart'];
  }

  if (brand.includes('dacia')) {
    return ['Journey', 'Prestige', 'Comfort', 'Expression', 'Essential', 'Stepway', 'Laureate', 'Ambiance', 'Standart'];
  }

  if (brand.includes('toyota')) {
    return ['Flame X-Pack', 'Flame', 'Passion X-Pack', 'Passion', 'Vision', 'Dream', 'Style', 'Standart'];
  }

  if (brand.includes('honda')) {
    return ['Executive+', 'Executive', 'Elegance', 'Dream', 'Type R', 'Standart'];
  }

  if (brand.includes('skoda') || brand.includes('škoda')) {
    return ['RS', 'Monte Carlo', 'L&K (Laurin & Klement)', 'Prestige', 'Style', 'Ambition', 'Active', 'Standart'];
  }

  if (brand.includes('seat') || brand.includes('cupra')) {
    return ['VZ', 'FR', 'Style', 'Xcellence', 'Reference', 'Standart'];
  }

  if (brand.includes('volvo')) {
    return ['Ultimate', 'Plus', 'Core', 'R-Design', 'Inscription', 'Momentum', 'Standart'];
  }

  if (brand.includes('nissan')) {
    return ['Platinum Premium', 'Platinum', 'Sky Pack', 'N-Design', 'Tekna', 'Visia', 'Standart'];
  }

  if (brand.includes('chery')) {
    return ['Luxury', 'Excellence', 'Pro Max', 'Comfort', 'Standart'];
  }

  return ['AMG / M / Sport Line', 'Prestige / Luxury', 'Comfort / Style', 'Standart'];
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================
async function run() {
  console.log('=== RESEEDING WITH ACCURATE TURKISH MARKET PRICING ===\n');

  // 1. Purge dependent data
  await prisma.consignmentApplication.deleteMany();
  await prisma.vehicleEvaluation.deleteMany();
  await prisma.vehicleMarketPrice.deleteMany();
  await prisma.vehicleSpecification.deleteMany();
  await prisma.package.deleteMany();
  await prisma.variant.deleteMany();
  console.log('Purged old data.\n');

  // 2. Load attribute references
  const fuelTypesList = ['Benzin', 'Dizel', 'Hibrit', 'Elektrik', 'LPG'];
  const transTypesList = ['Manuel', 'Otomatik', 'Yarı Otomatik'];
  const bodyTypesList = ['Sedan', 'SUV', 'Hatchback', 'Coupe', 'Cabrio', 'Station Wagon', 'MPV', 'Pickup'];
  const driveTypesList = ['Önden Çekiş', 'Arkadan İtiş', '4x4'];

  const fuelMap: Record<string, string> = {};
  const transMap: Record<string, string> = {};
  const bodyMap: Record<string, string> = {};
  const driveMap: Record<string, string> = {};

  for (const f of fuelTypesList) {
    const res = await prisma.fuelType.upsert({ where: { name: f }, update: {}, create: { name: f } });
    fuelMap[f] = res.id;
  }
  for (const t of transTypesList) {
    const res = await prisma.transmissionType.upsert({ where: { name: t }, update: {}, create: { name: t } });
    transMap[t] = res.id;
  }
  for (const b of bodyTypesList) {
    const res = await prisma.bodyType.upsert({ where: { name: b }, update: {}, create: { name: b } });
    bodyMap[b] = res.id;
  }
  for (const d of driveTypesList) {
    const res = await prisma.driveType.upsert({ where: { name: d }, update: {}, create: { name: d } });
    driveMap[d] = res.id;
  }

  // 3. Load all models from DB
  const models = await prisma.model.findMany({ include: { manufacturer: true } });
  console.log(`Found ${models.length} models to process.\n`);

  let processedCount = 0;
  let variantCount = 0;
  const specBatch: any[] = [];
  const marketPriceBatch: any[] = [];

  for (const model of models) {
    const brandName = model.manufacturer.name;
    const modelName = model.name;
    const lb = brandName.toLowerCase();
    const lm = modelName.toLowerCase();

    // Get variant names from mapping, or generate fallback
    const brandMap = VARIANT_MAP[brandName];
    let variantNames: string[];

    if (brandMap && brandMap[modelName]) {
      variantNames = brandMap[modelName];
    } else {
      // Fallback: use model name as variant
      variantNames = [modelName];
    }

    // Determine years
    const targetYears = getYearsForModel(brandName, modelName);

    // Determine vehicle class for pricing
    let isElectric = false;
    let isExotic = false;
    let isSuperSports = false;
    let isLuxuryExecutive = false;
    let isLuxurySUV = false;
    let isMidExecutive = false;
    let isCompactExecutive = false;
    let isEconomy = false;
    let isPremiumCompact = false;  // BMW 1, A-Class, A3, etc.
    let isEuropeanMidRange = false;  // Alfa Romeo, Volvo V40, etc.
    let isJapaneseMainstream = false;  // Toyota, Honda, Mazda, Nissan, Suzuki, Mitsubishi
    let isKoreanMainstream = false;  // Hyundai, Kia (non-economy models)
    let isFrenchMainstream = false;  // Peugeot, Renault (non-economy), Citroen (non-economy)
    let isTurkishVan = false;  // Karsan, Temsa
    let isPickupTruck = false;  // Ford Ranger, Toyota Hilux, etc.
    let isCSegmentPopular = false;  // Golf, Focus, Megane, Civic, Corolla, etc.
    let isMidSUV = false;  // Tucson, Sportage, Qashqai, T-Roc, Ateca, etc.

    if (
      lb.includes('tesla') || lb.includes('togg') || lb.includes('aion') ||
      lb.includes('joyce') || lb.includes('jiayuan') ||
      lm.includes('taycan') || lm.includes('e-tron') ||
      lm.includes('id.3') || lm.includes('id.4') || lm.includes('id.5') || lm.includes('id.buzz') ||
      lm.includes('zoe') || lm.includes('spring') ||
      lm.includes('ioniq 5') || lm.includes('ioniq 6') || lm.includes('leaf') ||
      (lb.includes('byd') && (lm.includes('atto') || lm.includes('seal') || lm.includes('dolphin')))
    ) isElectric = true;

    if (
      lb.includes('ferrari') || lb.includes('lamborghini') || lb.includes('mclaren') ||
      lb.includes('rolls-royce') || lb.includes('bugatti')
    ) isExotic = true;
    else if (
      lb.includes('aston') || lb.includes('bentley') || lb.includes('porsche') || lb.includes('maserati') ||
      lm.includes('m2') || lm.includes('m3') || lm.includes('m4') || lm.includes('m5') || lm.includes('m6') || lm.includes('m8') ||
      lm.includes('rs3') || lm.includes('rs4') || lm.includes('rs5') || lm.includes('rs6') || lm.includes('rs7') || lm.includes('rs q8') || lm.includes('r8') ||
      lm.includes('amg gt') || lm.includes('g-class') || lm.includes('g serisi') ||
      lm.includes('corvette') || lm.includes('viper') || lm.includes('gt-r') || lm.includes('mustang') || lm.includes('challenger')
    ) isSuperSports = true;
    else if (
      lm.includes('7 series') || lm.includes('7 serisi') || lm.includes('8 series') || lm.includes('8 serisi') ||
      lm.includes('s-class') || lm.includes('s serisi') || lm.includes('cl') || lm.includes('a8') ||
      lm.includes('panamera') || lm.includes('ls') || lm.includes('town car') || lm.includes('continental') ||
      lm.includes('flying spur') || lm.includes('mulsanne')
    ) isLuxuryExecutive = true;
    else if (
      lm.includes('x5') || lm.includes('x6') || lm.includes('x7') ||
      lm.includes('gle') || lm.includes('gls') || lm.includes('ml') || lm.includes('gl ') ||
      lm.includes('q7') || lm.includes('q8') ||
      lm.includes('range rover') || lm.includes('cayenne') || lm.includes('macan') ||
      lm.includes('escalade') || lm.includes('navigator') || lm.includes('tahoe') || lm.includes('touareg') ||
      lm.includes('stelvio') || lm.includes('discovery') || lm.includes('defender')
    ) isLuxurySUV = true;
    else if (
      lm.includes('5 series') || lm.includes('5 serisi') || lm.includes('6 series') || lm.includes('6 serisi') ||
      lm.includes('e-class') || lm.includes('e serisi') || lm.includes('cls') ||
      lm.includes('a6') || lm.includes('a7') || lm.includes('s90') || lm.includes('v90') || lm.includes('xc90')
    ) isMidExecutive = true;
    else if (
      lm.includes('3 series') || lm.includes('3 serisi') || lm.includes('4 series') || lm.includes('4 serisi') ||
      lm.includes('c-class') || lm.includes('c serisi') || lm.includes('cla') ||
      lm.includes('a4') || lm.includes('a5') ||
      lm.includes('q5') || lm.includes('x3') || lm.includes('x4') ||
      lm.includes('glc') || lm.includes('s60') || lm.includes('v60') || lm.includes('xc60')
    ) isCompactExecutive = true;
    else if (
      lm.includes('1 series') || lm.includes('1 serisi') || lm.includes('2 series') || lm.includes('2 serisi') ||
      lm.includes('a-class') || lm.includes('a serisi') || lm.includes('b-class') || lm.includes('b serisi') ||
      lm.includes('a1') || lm.includes('a3') || lm.includes('q2') || lm.includes('q3') ||
      lm.includes('x1') || lm.includes('x2') || lm.includes('gla') || lm.includes('glb') ||
      lm.includes('v40') || lm.includes('c30') || lm.includes('mini')
    ) isPremiumCompact = true;
    else if (
      lb.includes('alfa romeo') || lb.includes('volvo') || lb.includes('ds') ||
      lb.includes('saab') || lb.includes('lancia') || lb.includes('alpine') ||
      lb.includes('cupra') || lb.includes('seat') || lb.includes('skoda') ||
      (lb.includes('volkswagen') && !lm.includes('polo') && !lm.includes('up'))
    ) isEuropeanMidRange = true;
    else if (
      lm.includes('ranger') || lm.includes('hilux') || lm.includes('l200') || lm.includes('navara') ||
      lm.includes('amarok') || lm.includes('d-max') || lm.includes('raptor')
    ) isPickupTruck = true;
    else if (
      lm.includes('tucson') || lm.includes('sportage') || lm.includes('qashqai') || lm.includes('x-trail') ||
      lm.includes('t-roc') || lm.includes('t-cross') || lm.includes('ateca') || lm.includes('karoq') ||
      lm.includes('tiguan') || lm.includes('3008') || lm.includes('5008') || lm.includes('kadjar') ||
      lm.includes('arkana') || lm.includes('austral') || lm.includes('kuga') || lm.includes('puma') ||
      lm.includes('captur') || lm.includes('2008') || lm.includes('grandland') || lm.includes('mokka') ||
      lm.includes('crossland') || lm.includes('bayon') || lm.includes('kona') || lm.includes('seltos') ||
      lm.includes('stonic') || lm.includes('ecosport') || lm.includes('c-hr') || lm.includes('rav4') ||
      lm.includes('hr-v') || lm.includes('cr-v') || lm.includes('cx-30') || lm.includes('cx-5') ||
      lm.includes('cx-3') || lm.includes('forester') || lm.includes('xv') || lm.includes('vitara') ||
      lm.includes('sx4') || lm.includes('outlander') || lm.includes('asx') || lm.includes('kamiq') ||
      lm.includes('kodiaq') || lm.includes('tarraco') || lm.includes('arona') ||
      lm.includes('renegade') || lm.includes('compass') || lm.includes('tonale')
    ) isMidSUV = true;
    else if (
      lm.includes('golf') || lm.includes('focus') || lm.includes('megane') || lm.includes('civic') ||
      lm.includes('corolla') || lm.includes('cerato') || lm.includes('elantra') || lm.includes('i30') ||
      lm.includes('mazda3') || lm.includes('mazda 3') || lm.includes('impreza') || lm.includes('308') ||
      lm.includes('astra') || lm.includes('leon') || lm.includes('octavia') || lm.includes('scala') ||
      lm.includes('jetta') || lm.includes('passat') || lm.includes('arteon') ||
      lm.includes('superb') || lm.includes('508') || lm.includes('talisman') || lm.includes('insignia') ||
      lm.includes('mondeo') || lm.includes('c4') || lm.includes('tipo') || lm.includes('giulietta') ||
      lm.includes('mito')
    ) isCSegmentPopular = true;
    else if (
      lb.includes('toyota') || lb.includes('honda') || lb.includes('mazda') || lb.includes('nissan') ||
      lb.includes('suzuki') || lb.includes('mitsubishi') || lb.includes('subaru') || lb.includes('lexus') ||
      lb.includes('infiniti')
    ) isJapaneseMainstream = true;
    else if (
      lb.includes('hyundai') || lb.includes('kia') || lb.includes('ssangyong') || lb.includes('genesis')
    ) isKoreanMainstream = true;
    else if (
      lb.includes('peugeot') || lb.includes('renault') || lb.includes('citroen') || lb.includes('opel') ||
      lb.includes('ford')
    ) isFrenchMainstream = true;
    else if (
      lb.includes('karsan') || lb.includes('temsa') || lb.includes('bmc')
    ) isTurkishVan = true;
    else if (
      lb.includes('fiat') || lb.includes('dacia') ||
      lb.includes('chevrolet') || lb.includes('daewoo') || lb.includes('tata') ||
      lb.includes('tofaş') || lb.includes('tofas') || lb.includes('anadol') ||
      lb.includes('arora') || lb.includes('proton') || lb.includes('geely') ||
      lb.includes('chery') || lb.includes('dfsk') || lb.includes('mg') ||
      lm.includes('polo') || lm.includes('up')
    ) isEconomy = true;

    // ================================================================
    // REALISTIC PRICING - Calibrated to Sahibinden.com 2026 market data
    // basePrice2026 = Sıfır araç liste fiyatı (2026 model)
    // floorPrice    = En eski modelin minimum piyasa değeri
    // ================================================================
    let basePrice2026 = 2200000;  // Default: orta-alt segment
    let floorPrice = 650000;      // Default: eski araçlar 650K altına düşmez
    let depRate = 0.90;           // Default: yıllık %10 değer kaybı

    if (isExotic) {
      basePrice2026 = 40000000;
      floorPrice = 12000000;
      depRate = 0.93;  // Egzotikler çok yavaş değer kaybeder
    } else if (isSuperSports) {
      basePrice2026 = 20000000;
      floorPrice = 5500000;
      depRate = 0.92;
    } else if (isLuxuryExecutive) {
      basePrice2026 = 14000000;
      floorPrice = 3500000;
      depRate = 0.91;
    } else if (isLuxurySUV) {
      basePrice2026 = 11000000;
      floorPrice = 3000000;
      depRate = 0.91;
    } else if (isElectric) {
      basePrice2026 = 3800000;
      floorPrice = 1400000;
      depRate = 0.88;  // Elektrikli araçlar hızlı değer kaybeder
    } else if (isMidExecutive) {
      basePrice2026 = 6500000;
      floorPrice = 2000000;
      depRate = 0.91;
    } else if (isCompactExecutive) {
      basePrice2026 = 4800000;
      floorPrice = 1500000;
      depRate = 0.91;
    } else if (isPremiumCompact) {
      basePrice2026 = 3500000;
      floorPrice = 1100000;
      depRate = 0.90;
    } else if (isPickupTruck) {
      basePrice2026 = 4000000;
      floorPrice = 1600000;
      depRate = 0.92;  // Kamyonetler çok yavaş değer kaybeder
    } else if (isEuropeanMidRange) {
      // Alfa Romeo Giulietta, Volvo, Seat, Skoda, VW (non-Polo), DS, Cupra, etc.
      basePrice2026 = 3200000;
      floorPrice = 900000;
      depRate = 0.91;
    } else if (isMidSUV) {
      basePrice2026 = 3500000;
      floorPrice = 1000000;
      depRate = 0.91;
    } else if (isCSegmentPopular) {
      // Golf, Civic, Corolla, Focus, Megane, Giulietta, etc.
      basePrice2026 = 2800000;
      floorPrice = 800000;
      depRate = 0.90;
    } else if (isJapaneseMainstream) {
      basePrice2026 = 2600000;
      floorPrice = 750000;
      depRate = 0.91;  // Japon araçları değer kaybetmez
    } else if (isKoreanMainstream) {
      basePrice2026 = 2400000;
      floorPrice = 700000;
      depRate = 0.90;
    } else if (isFrenchMainstream) {
      basePrice2026 = 2200000;
      floorPrice = 650000;
      depRate = 0.89;
    } else if (isTurkishVan) {
      basePrice2026 = 2000000;
      floorPrice = 600000;
      depRate = 0.90;
    } else if (isEconomy) {
      if (lb.includes('tofaş') || lb.includes('tofas') || lb.includes('anadol')) {
        basePrice2026 = 500000;
        floorPrice = 250000;
        depRate = 0.95;  // Klasikler neredeyse değer kaybetmez
      } else if (lb.includes('dacia')) {
        basePrice2026 = 1600000;
        floorPrice = 550000;
        depRate = 0.89;
      } else {
        basePrice2026 = 1400000;
        floorPrice = 450000;
        depRate = 0.89;
      }
    }

    // Determine attributes
    const isVariantElectric = (vn: string) => {
      const lv = vn.toLowerCase();
      return isElectric || lv.includes('electric') || lv.includes('elektrik') || lv.includes('recharge') ||
        lv.includes(' ev') || lv.includes('e-tron') || lv.includes('eqa') || lv.includes('eqb') ||
        lv.includes('eqc') || lv.includes('eqe') || lv.includes('eqs') ||
        lv.includes('taycan') || lv.includes('enyaq') || lv.includes('id.') ||
        lv.includes('mach-e') || lv.includes('corsa-e') || lv.includes('mokka-e') ||
        lv.includes('e-208') || lv.includes('e-2008') || lv.includes('e-up') ||
        lv.includes('500e') || lv.includes('born') || lv.includes('i3') || lv.includes('i4 ') ||
        lv.includes('ix') || lv.includes('i7 ') || lv.includes('spring') ||
        lv.includes('zoe') || lv.includes('leaf') || lv.includes('niro ev') ||
        lv.includes('kona electric') || lv.includes('ev6') || lv.includes('mii electric') ||
        lv.includes('fortwo eq') || lv.includes('forfour eq') || lv.includes('c40 recharge') ||
        lv.includes('xc40 recharge') || lv.includes('cooper se');
    };

    const isVariantHybrid = (vn: string) => {
      const lv = vn.toLowerCase();
      return lv.includes('hybrid') || lv.includes('e-tech') || lv.includes('phev') ||
        lv.includes('e-hybrid') || lv.includes('e:hev') || lv.includes('e-boxer') ||
        lv.includes('gte') || lv.includes('4xe') || lv.includes('dm-i') || lv.includes('e-power');
    };

    for (const vName of variantNames) {
      const eSpecs = getEngineSpecsForVariant(brandName, modelName, vName);
      const variantElectric = isVariantElectric(vName);
      const variantHybrid = isVariantHybrid(vName);

      const variant = await prisma.variant.create({
        data: {
          name: vName,
          modelId: model.id,
          engineSize: eSpecs.engineSize,
          horsepower: eSpecs.horsepower,
          torque: eSpecs.torque,
          cylinders: eSpecs.cylinders,
        },
      });
      variantCount++;

      // Determine fuel type
      let fuel = 'Benzin';
      if (variantElectric) fuel = 'Elektrik';
      else if (variantHybrid) fuel = 'Hibrit';
      else if (lb.includes('tofaş') || lb.includes('tofas')) fuel = 'LPG';
      else if (vName.toLowerCase().includes(' d') || vName.toLowerCase().includes('tdi') || vName.toLowerCase().includes('cdi') || vName.toLowerCase().includes('hdi') || vName.toLowerCase().includes('dci') || vName.toLowerCase().includes('crdi') || vName.toLowerCase().includes('multijet') || vName.toLowerCase().includes('gtd')) fuel = 'Dizel';

      // Determine transmission
      let trans = 'Otomatik';
      if (lb.includes('tofaş') || lb.includes('tofas') || lb.includes('anadol')) trans = 'Manuel';

      // Determine body type
      let body = 'Sedan';
      const lv = vName.toLowerCase();
      if (lv.includes('suv') || lv.includes('cross') || lv.includes('x-trail') || lv.includes('qashqai') || lv.includes('tucson') || lv.includes('sportage') || lv.includes('cr-v') || lv.includes('hr-v') || lv.includes('rav4') || lv.includes('kuga') || lv.includes('duster') || lv.includes('ateca') || lv.includes('karoq') || lv.includes('kodiaq') || lv.includes('tiguan') || lv.includes('touareg') || lv.includes('macan') || lv.includes('cayenne') || lv.includes('bentayga') || lv.includes('cullinan') || lv.includes('dbx') || lv.includes('defender') || lv.includes('discovery') || lv.includes('range rover') || lv.includes('escalade') || lv.includes('navigator') || lv.includes('x1') || lv.includes('x2') || lv.includes('x3') || lv.includes('x4') || lv.includes('x5') || lv.includes('x6') || lv.includes('x7') || lv.includes('gla') || lv.includes('glb') || lv.includes('glc') || lv.includes('gle') || lv.includes('gls') || lv.includes('g serisi') || lv.includes('q2') || lv.includes('q3') || lv.includes('q5') || lv.includes('q7') || lv.includes('q8') || lv.includes('stelvio') || lv.includes('tonale') || lv.includes('terios') || lv.includes('jimny') || lv.includes('vitara') || lv.includes('forester') || lv.includes('outback') || lv.includes('xv') || lv.includes('xc40') || lv.includes('xc60') || lv.includes('xc90') || lv.includes('mokka') || lv.includes('grandland') || lv.includes('crossland') || lv.includes('bayon') || lv.includes('kona') || lv.includes('santa fe') || lv.includes('seltos') || lv.includes('stonic') || lv.includes('captur') || lv.includes('kadjar') || lv.includes('koleos') || lv.includes('arkana') || lv.includes('austral') || lv.includes('puma') || lv.includes('ecosport') || lv.includes('renegade') || lv.includes('compass') || lv.includes('cherokee') || lv.includes('wrangler') || lv.includes('2008') || lv.includes('3008') || lv.includes('5008') || lv.includes('aircross') || lv.includes('arona') || lv.includes('tarraco') || lv.includes('kamiq') || lv.includes('scala') || lv.includes('t-cross') || lv.includes('t-roc') || lv.includes('marvel') || lv.includes('hs ') || lv.includes('zs') || lv.includes('e-pace') || lv.includes('f-pace') || lv.includes('i-pace') || lv.includes('ix') || lv.includes('atto') || lv.includes('tang')) {
        body = 'SUV';
      } else if (lv.includes('hatchback') || lv.includes('3 kapı') || lv.includes('5 kapı') || lv.includes('sportback') || lv.includes('fastback') || lv.includes('gran coupe') || lv.includes('grand sport') || lv.includes('gtc')) {
        body = 'Hatchback';
      } else if (lv.includes('coupe') || lv.includes('spider') || lv.includes('spyder') || lv.includes('roadster') || lv.includes('cayman') || lv.includes('boxster') || lv.includes('supra') || lv.includes('brz') || lv.includes('scirocco') || lv.includes('tt ') || lv.includes('z4') || lv.includes('sl ') || lv.includes('slc') || lv.includes('rcz') || lv.includes('350z') || lv.includes('370z') || lv.includes('gt-r') || lv.includes('r8')) {
        body = 'Coupe';
      } else if (lv.includes('cabrio') || lv.includes('volante') || lv.includes('convertible') || lv.includes('cc') || lv.includes('targa') || lv.includes('cielo')) {
        body = 'Cabrio';
      } else if (lv.includes('station wagon') || lv.includes('touring') || lv.includes('variant') || lv.includes('combi') || lv.includes('avant') || lv.includes('sw') || lv.includes('estate') || lv.includes('sportcombi') || lv.includes('sport tourer') || lv.includes('sports tourer') || lv.includes('sportstourer') || lv.includes('wagon') || lv.includes('shooting brake') || lv.includes('allroad') || lv.includes('cross country') || lv.includes('all-terrain') || lv.includes('scout') || lv.includes('country tourer') || lv.includes('outdoor') || lv.includes('cross turismo') || lv.includes('sport turismo')) {
        body = 'Station Wagon';
      } else if (lv.includes('mpv') || lv.includes('scenic') || lv.includes('picasso') || lv.includes('zafira') || lv.includes('meriva') || lv.includes('b-max') || lv.includes('c-max') || lv.includes('s-max') || lv.includes('galaxy') || lv.includes('touran') || lv.includes('carnival') || lv.includes('lodgy') || lv.includes('multispace') || lv.includes('kombi') || lv.includes('life') || lv.includes('tourer') || lv.includes('tepee') || lv.includes('rifter') || lv.includes('berlingo') || lv.includes('kangoo') || lv.includes('caddy') || lv.includes('doblo') || lv.includes('partner') || lv.includes('connect') || lv.includes('custom') || lv.includes('courier') || lv.includes('nemo') || lv.includes('fiorino') || lv.includes('vito') || lv.includes('v serisi') || lv.includes('buzz')) {
        body = 'MPV';
      } else if (lv.includes('pickup') || lv.includes('ranger') || lv.includes('hilux') || lv.includes('navara') || lv.includes('raptor') || lv.includes('wildtrak')) {
        body = 'Pickup';
      }

      // Determine drive type
      let drive = 'Önden Çekiş';
      if (variantElectric) drive = 'Arkadan İtiş';
      if (lv.includes('4x4') || lv.includes('4matic') || lv.includes('quattro') || lv.includes('xdrive') || lv.includes('awd') || lv.includes('4orce') || lv.includes('4xe') || lv.includes('gtx') || lv.includes('allroad') || lv.includes('all-terrain') || lv.includes('cross country') || lv.includes('4motion') || lv.includes('wrangler') || lv.includes('defender') || lv.includes('land cruiser') || lv.includes('g serisi') || lv.includes('g 350') || lv.includes('g 400') || lv.includes('g 500') || lv.includes('g 63')) {
        drive = '4x4';
      }
      if (isExotic && !variantElectric) drive = 'Arkadan İtiş';

      // Popularity
      let popularity = 7.0;
      if (isElectric || variantElectric) popularity = 8.5;
      if (isEconomy) popularity = 8.5;
      if (isExotic) popularity = 6.0;

      const packageList = getPackagesForVariant(brandName, model.name, variant.name);

      for (const pkgName of packageList) {
        const pkg = await prisma.package.create({
          data: { name: pkgName, variantId: variant.id },
        });

        let pkgPriceMult = 1.0;
        if (pkgName.includes('AMG') || pkgName.includes('M Sport') || pkgName.includes('RS') || pkgName.includes('R-Line') || pkgName.includes('S Line') || pkgName.includes('Titanium X') || pkgName.includes('Exclusive') || pkgName.includes('Icon') || pkgName.includes('GT') || pkgName.includes('Flame X-Pack') || pkgName.includes('Lounge') || pkgName.includes('Ultimate')) {
          pkgPriceMult = 1.10;
        } else if (pkgName.includes('Avantgarde') || pkgName.includes('Luxury') || pkgName.includes('Elegance') || pkgName.includes('Style') || pkgName.includes('Titanium') || pkgName.includes('Allure') || pkgName.includes('Touch') || pkgName.includes('Comfortline') || pkgName.includes('Prestige')) {
          pkgPriceMult = 1.05;
        }

        for (const year of targetYears) {
          const age = 2026 - year;
          // Use category-specific depreciation rate (depRate is set above per category)
          const depMultiplier = Math.pow(depRate, age);

          // Variant-level price adjustment
          let variantPriceMult = 1.0;
          if (lv.includes('performance') || lv.includes('plaid') || lv.includes('amg') || lv.includes('m5') || lv.includes('rs') || lv.includes('trofeo') || lv.includes('svr') || lv.includes('quadrifoglio')) {
            variantPriceMult = 1.25;
          } else if (lv.includes('competition')) {
            variantPriceMult = 1.12;
          } else if (lv.includes('sport') || lv.includes('gti') || lv.includes('st ') || lv.includes('type r') || lv.includes('opc') || lv.includes('nismo') || lv.includes('cupra') || lv.includes('r-line') || lv.includes('fr') || lv.includes('long range')) {
            variantPriceMult = 1.10;
          } else if (lv.includes('cabrio') || lv.includes('convertible') || lv.includes('roadster') || lv.includes('volante') || lv.includes('spider') || lv.includes('spyder')) {
            variantPriceMult = 1.15;
          }

          const specPrice = Math.round(
            (floorPrice + (basePrice2026 - floorPrice) * depMultiplier) * variantPriceMult * pkgPriceMult
          );

          const specId = randomUUID();
          specBatch.push({
            id: specId,
            year,
            manufacturerId: model.manufacturerId,
            modelId: model.id,
            variantId: variant.id,
            packageId: pkg.id,
            bodyTypeId: bodyMap[body] || bodyMap['Sedan'],
            fuelTypeId: fuelMap[fuel] || fuelMap['Benzin'],
            transmissionTypeId: transMap[trans] || transMap['Otomatik'],
            driveTypeId: driveMap[drive] || driveMap['Önden Çekiş'],
            doors: ['Coupe', 'Cabrio'].includes(body) ? 2 : (['Hatchback'].includes(body) ? 5 : 4),
            seats: body === 'Coupe' ? 4 : 5,
            originalMSRP: specPrice * 1.2,
            popularityScore: popularity,
            reliabilityScore: 8.0,
          });

          marketPriceBatch.push({
            vehicleSpecificationId: specId,
            currentMarketAverage: specPrice,
            cleanMarketAverage: Math.round(specPrice * 1.05),
            averageListingPrice: Math.round(specPrice * 1.03),
            minPrice: Math.round(specPrice * 0.92),
            maxPrice: Math.round(specPrice * 1.08),
            regionalPriceDifferences: JSON.stringify({ Istanbul: 1.0, Ankara: 0.98, Izmir: 0.99 }),
            averageSellingTime: isEconomy ? 12 : 20,
          });
        }
      }
    }

    processedCount++;
    if (processedCount % 50 === 0) {
      console.log(`Generated models ${processedCount}/${models.length} in memory...`);
    }
  }

  console.log(`\nInserting ${specBatch.length} specs and market prices in fast bulk transactions...`);
  const BATCH_SIZE = 2000;
  for (let i = 0; i < specBatch.length; i += BATCH_SIZE) {
    const chunkSpecs = specBatch.slice(i, i + BATCH_SIZE);
    const chunkPrices = marketPriceBatch.slice(i, i + BATCH_SIZE);
    await prisma.vehicleSpecification.createMany({ data: chunkSpecs });
    await prisma.vehicleMarketPrice.createMany({ data: chunkPrices });
    console.log(`Seeded ${Math.min(i + BATCH_SIZE, specBatch.length)} / ${specBatch.length} specs...`);
  }

  console.log(`\n=== RESEEDING COMPLETE ===`);
  console.log(`Models processed: ${processedCount}`);
  console.log(`Variants created: ${variantCount}`);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
