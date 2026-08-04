import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const SAHIBINDEN_CATALOG: Record<string, string[]> = {
  'Abarth': ['124 Spider', '500', '595', '695', 'Grande Punto', 'Punto Evo'],
  'Acura': ['Integra', 'MDX', 'NSX', 'RDX', 'RL', 'TL', 'TLX', 'TSX'],
  'Aion': ['S', 'V', 'Y'],
  'Alfa Romeo': ['33', '75', '145', '146', '147', '155', '156', '159', '164', '166', 'Brera', 'Giulia', 'Giulietta', 'GT', 'GTV', 'MiTo', 'Spider', 'Stelvio', 'Tonale'],
  'Alpine': ['A110'],
  'Anadol': ['A1', 'A2', 'A8', 'STC-16', 'SV-1600'],
  'Arora': ['M1', 'S1'],
  'Aston Martin': ['DB7', 'DB9', 'DB11', 'DBS', 'DBX', 'Rapide', 'Vanquish', 'Vantage'],
  'Audi': ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'e-tron', 'e-tron GT', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'R8', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7', 'RS Q8', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'SQ5', 'SQ7', 'SQ8', 'TT'],
  'Bentley': ['Arnage', 'Bentayga', 'Continental', 'Flying Spur', 'Mulsanne'],
  'BMW': [
    '1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series',
    'i3', 'i4', 'i7', 'iX', 'iX1', 'iX3', 'i8',
    'M2', 'M3', 'M4', 'M5', 'M6', 'M8',
    'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z3', 'Z4'
  ],
  'Buick': ['Century', 'LeSabre', 'Park Avenue', 'Regal', 'Riviera'],
  'BYD': ['Atto 3', 'Dolphin', 'Han', 'Seal', 'Seal U', 'Tang'],
  'Cadillac': ['ATS', 'BLS', 'CTS', 'Deville', 'Eldorado', 'Escalade', 'FleetWood', 'Seville', 'SRX', 'STS', 'XLR'],
  'Chery': ['Alia', 'Arrizo 5', 'Chance', 'Kimo', 'Omoda 5', 'Tiggo', 'Tiggo 4 Pro', 'Tiggo 7 Pro', 'Tiggo 8 Pro', 'Taxim'],
  'Chevrolet': ['Aveo', 'Camaro', 'Caprice', 'Cavalier', 'Celebrity', 'Corsica', 'Corvette', 'Cruze', 'Epica', 'Evanda', 'Geo Storm', 'Impala', 'Kalos', 'Lacetti', 'Lumina', 'Monte Carlo', 'Nubira', 'Rezzo', 'Spark', 'Suburban', 'Tahoe', 'Tracker', 'Trailblazer', 'Traverse', 'Trax'],
  'Chrysler': ['300C', '300 M', 'Concorde', 'Crossfire', 'Grand Voyager', 'Le Baron', 'LHS', 'Neon', 'PT Cruiser', 'Sebring', 'Stratus', 'Town & Country', 'Voyager'],
  'Citroen': ['AMI', 'AX', 'Berlingo', 'BX', 'C-Elysee', 'C-Crosser', 'C1', 'C2', 'C3', 'C3 Aircross', 'C3 Picasso', 'C4', 'C4 Aircross', 'C4 Cactus', 'C4 Grand Picasso', 'C4 Picasso', 'C4 X', 'C5', 'C5 Aircross', 'C5 X', 'C6', 'C8', 'DS3', 'DS4', 'DS5', 'E-Mehari', 'Saxo', 'Xantia', 'XM', 'Xsara', 'Xsara Picasso', 'ZX'],
  'Cupra': ['Ateca', 'Born', 'Formentor', 'Leon'],
  'Dacia': ['Dokker', 'Duster', 'Jogger', 'Lodgy', 'Logan', 'Nova', 'Solenza', 'SuperNova', 'Sandero', 'Spring'],
  'Daewoo': ['Espero', 'Kalos', 'Korando', 'Lanos', 'Leganza', 'Matiz', 'Nexia', 'Nubira', 'Prince', 'Super Salon', 'Tico', 'Tacuma'],
  'Daihatsu': ['Applause', 'Charade', 'Copen', 'Cuore', 'Materia', 'Sirion', 'Terios', 'YRV'],
  'Dodge': ['Avenger', 'Caliber', 'Challenger', 'Charger', 'Dart', 'Durango', 'Intrepid', 'Magnum', 'Neon', 'Nitro', 'Ram', 'Stealth', 'Viper'],
  'DS Automobiles': ['DS 3', 'DS 3 Crossback', 'DS 4', 'DS 5', 'DS 7', 'DS 7 Crossback', 'DS 9'],
  'Eagle': ['Talon'],
  'Ferrari': ['208', '308', '328', '348', '355', '360', '400', '456', '458', '488', '512', '550', '575', '599', '612', '812', 'California', 'F12 Berlinetta', 'F355', 'F430', 'F8', 'FF', '296', 'Portofino', 'Roma', 'SF90', 'Purosangue'],
  'Fiat': ['124', '124 Spider', '126', '131', '500', '500C', '500L', '500X', '500e', 'Albea', 'Barchetta', 'Coupe', 'Croma', 'Doblo', 'Egea', 'Fiorino', 'Freemont', 'Idea', 'Linea', 'Marea', 'Multipla', 'Palio', 'Panda', 'Punto', 'Punto Evo', 'Grande Punto', 'Seicento', 'Siena', 'Stilo', 'Sedici', 'Tempra', 'Tipo', 'Uno'],
  'Ford': ['B-Max', 'C-Max', 'Capri', 'Cortina', 'Courier', 'Crown Victoria', 'Escort', 'Festiva', 'Fiesta', 'Focus', 'Fusion', 'Galaxy', 'Granada', 'Grand C-Max', 'GT', 'Ka', 'Ka+', 'Kuga', 'Mondeo', 'Mustang', 'Mustang Mach-E', 'Probe', 'Puma', 'Ranger', 'Scorpio', 'Sierra', 'S-Max', 'Taunus', 'Taurus', 'Thunderbird', 'Tourneo Connect', 'Tourneo Courier', 'Tourneo Custom'],
  'Geely': ['CK', 'Echo', 'Emgrand', 'FC'],
  'Honda': ['Accord', 'City', 'Civic', 'CR-V', 'CR-X', 'CR-Z', 'FR-V', 'HR-V', 'Insight', 'Integra', 'Jazz', 'Legend', 'Prelude', 'S2000', 'Stream', 'ZR-V', 'e:Ny1'],
  'Hyundai': ['Accent', 'Accent Blue', 'Accent Era', 'Atos', 'Bayon', 'Coupe', 'Elantra', 'Excel', 'Genesis', 'Getz', 'Grandeur', 'i10', 'i20', 'i20 Active', 'i20 N', 'i30', 'i30 N', 'i40', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'ix20', 'ix35', 'Kona', 'Lantra', 'Matrix', 'Santa Fe', 'Scoupe', 'Sonata', 'Staria', 'Trajet', 'Tucson', 'Veloster'],
  'Ikco': ['Samand'],
  'Infiniti': ['EX', 'FX35', 'G35', 'G37', 'JX', 'M', 'Q30', 'Q50', 'Q60', 'Q70', 'QX70'],
  'Jaguar': ['E-Pace', 'F-Pace', 'F-Type', 'I-Pace', 'S-Type', 'X-Type', 'XE', 'XF', 'XJ', 'XJR', 'XJS', 'XK', 'XK8', 'XKR'],
  'Jeep': ['Avenger', 'Cherokee', 'Commander', 'Compass', 'Grand Cherokee', 'Patriot', 'Renegade', 'Wrangler'],
  'Jiayuan': ['City Spirit'],
  'Joyce': ['EV'],
  'Kia': ['Carens', 'Carnival', 'Ceed', 'Cerato', 'Clarus', 'EV6', 'EV9', 'Magentis', 'Niro', 'Opirus', 'Optima', 'Picanto', 'Pride', 'ProCeed', 'Rio', 'Sephia', 'Seltos', 'Shuma', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Stonic', 'Venga', 'XCeed'],
  'Lada': ['Forma', 'Kalina', 'Priora', 'Samara', 'Vega', 'Vesta', 'Granta'],
  'Lamborghini': ['Aventador', 'Countach', 'Diablo', 'Gallardo', 'Huracan', 'Murcielago', 'Revuelto', 'Urus'],
  'Lancia': ['Dedra', 'Delta', 'Flavia', 'Kappa', 'Lybra', 'Prisma', 'Thema', 'Ypsilon', 'Zeta'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'],
  'Lexus': ['CT', 'ES', 'GS', 'IS', 'LC', 'LS', 'NX', 'RC', 'RX', 'RZ', 'UX', 'LM'],
  'Lincoln': ['Aviator', 'Continental', 'Mark', 'LS', 'MKS', 'MKZ', 'Navigator', 'Town Car'],
  'Lotus': ['Elise', 'Emira', 'Esprit', 'Europa', 'Evora', 'Exige', 'Eletre'],
  'Maserati': ['3200 GT', '4200 GT', 'Coupe', 'Ghibli', 'GranCabrio', 'GranTurismo', 'Grecale', 'Levante', 'MC20', 'Quattroporte', 'Spyder'],
  'Mazda': ['2', '3', '5', '6', '121', '323', '626', '929', 'CX-3', 'CX-30', 'CX-5', 'CX-7', 'CX-9', 'CX-60', 'MPV', 'MX-3', 'MX-5', 'MX-30', 'RX-7', 'RX-8', 'Tribute'],
  'McLaren': ['570S', '600LT', '650S', '720S', '765LT', 'Artura', 'GT', 'MP4-12C', 'P1'],
  'Mercedes-Benz': [
    'A-Class', 'AMG GT', 'B-Class', 'C-Class', 'CL', 'CLA', 'CLK', 'CLS', 'E-Class',
    'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'G-Class', 'GL', 'GLA', 'GLB', 'GLC', 'GLE',
    'GLK', 'GLS', 'ML', 'R-Class', 'S-Class', 'SL', 'SLC', 'SLK', 'SLR', 'SLS', 'V-Class', 'Vito', 'X-Class'
  ],
  'MG': ['3', '4', '5', 'F', 'HS', 'EHS', 'Marvel R', 'TF', 'ZS', 'ZS EV'],
  'Mini': ['Clubman', 'Cooper', 'Cooper S', 'Countryman', 'Coupe', 'Paceman', 'Roadster', 'John Cooper Works'],
  'Mitsubishi': ['3000 GT', 'ASX', 'Carisma', 'Colt', 'Eclipse', 'Eclipse Cross', 'Galant', 'Lancer', 'Outlander', 'Pajero', 'Space Star', 'Space Wagon'],
  'Nissan': ['100 NX', '200 SX', '300 ZX', '350Z', '370Z', 'Almera', 'Altima', 'Bluebird', 'GT-R', 'Juke', 'Leaf', 'Maxima', 'Micra', 'Murano', 'Navara', 'Note', 'Pathfinder', 'Patrol', 'Primera', 'Pulsar', 'Qashqai', 'Sunny', 'Terrano', 'X-Trail'],
  'Opel': ['Adam', 'Agila', 'Ampera', 'Ascona', 'Astra', 'Calibra', 'Cascada', 'Combo', 'Corsa', 'Crossland', 'Crossland X', 'Frontera', 'Grandland', 'Grandland X', 'Insignia', 'Kadett', 'Karl', 'Meriva', 'Mokka', 'Mokka X', 'Monterey', 'Omega', 'Rekord', 'Senator', 'Signum', 'Tigra', 'Vectra', 'Zafira'],
  'Peugeot': ['106', '107', '108', '205', '206', '206+', '207', '208', '301', '305', '306', '307', '308', '309', '405', '406', '407', '408', '504', '505', '508', '605', '607', '806', '807', '1007', '2008', '3008', '4007', '4008', '5008', 'Bipper', 'Partner', 'Rifter', 'RCZ'],
  'Porsche': ['718', '911', '924', '928', '944', '968', 'Boxster', 'Cayman', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  'Proton': ['315', '413', '415', '416', '418', '420', 'Gen-2', 'Persona', 'Saga', 'Savvy', 'Waja', 'Wira'],
  'Renault': ['9', '11', '12', '19', '21', '25', 'Arkana', 'Austral', 'Captur', 'Clio', 'Espace', 'Fluence', 'Fuego', 'Grand Scenic', 'Kadjar', 'Kangoo', 'Koleos', 'Laguna', 'Latitude', 'Megane', 'Modus', 'Safrane', 'Scenic', 'Symbol', 'Taliant', 'Talisman', 'Toros', 'Twingo', 'Twizy', 'Vel Satis', 'Zoe'],
  'Rolls-Royce': ['Cullinan', 'Dawn', 'Ghost', 'Phantom', 'Spectre', 'Wraith'],
  'Rover': ['25', '45', '75', '100', '200', '400', '600', '800', 'Streetwise'],
  'Saab': ['9-3', '9-5', '900', '9000'],
  'Seat': ['Alhambra', 'Altea', 'Arona', 'Ateca', 'Cordoba', 'Exeo', 'Ibiza', 'Inca', 'Leon', 'Malaga', 'Mii', 'Marbella', 'Tarraco', 'Toledo'],
  'Skoda': ['Citigo', 'Enyaq', 'Fabia', 'Favorit', 'Felicia', 'Forman', 'Kamiq', 'Karoq', 'Kodiaq', 'Octavia', 'Rapid', 'Roomster', 'Scala', 'Superb', 'Yeti'],
  'Smart': ['Forfour', 'Fortwo', 'Roadster', '#1', '#3'],
  'Subaru': ['BRZ', 'Forester', 'Impreza', 'Justy', 'Legacy', 'Levorg', 'Outback', 'SVX', 'Vivio', 'XV', 'Solterra'],
  'Suzuki': ['Alto', 'Baleno', 'Celerio', 'Grand Vitara', 'Ignis', 'Jimny', 'Kizashi', 'Liana', 'Marathon', 'S-Cross', 'Splash', 'Swace', 'Swift', 'SX4', 'Vitara', 'Wagon R'],
  'Tata': ['Indica', 'Indigo', 'Marina', 'Telcoline', 'Xenon', 'Safari'],
  'Tesla': ['Cybertruck', 'Model 3', 'Model S', 'Model X', 'Model Y'],
  'Tofaş': ['Doğan', 'Kartal', 'Murat 124', 'Murat 131', 'Serçe', 'Şahin'],
  'Togg': ['T10X', 'T10F'],
  'Toyota': ['Auris', 'Avensis', 'bZ4X', 'Camry', 'Carina', 'Celica', 'C-HR', 'Corolla', 'Corona', 'Cressida', 'GT86', 'GR86', 'Hilux', 'Land Cruiser', 'MR2', 'Paseo', 'Picnic', 'Previa', 'Prius', 'RAV4', 'Starlet', 'Supra', 'Tercel', 'Urban Cruiser', 'Verso', 'Yaris', 'Yaris Cross'],
  'Volkswagen': ['Arteon', 'Beetle', 'Bora', 'Caddy', 'CC', 'Corrado', 'EOS', 'Fox', 'Golf', 'ID.3', 'ID.4', 'ID.5', 'ID.7', 'ID.Buzz', 'Jetta', 'Lupo', 'New Beetle', 'Passat', 'Passat CC', 'Passat Variant', 'Phaeton', 'Polo', 'Santana', 'Scirocco', 'Sharan', 'T-Cross', 'Taigo', 'T-Roc', 'Tiguan', 'Touareg', 'Touran', 'Up', 'Vento'],
  'Volvo': ['440', '460', '480', '740', '850', '940', '960', 'C30', 'C40', 'C70', 'EX30', 'EX90', 'S40', 'S60', 'S70', 'S80', 'S90', 'V40', 'V40 Cross Country', 'V50', 'V60', 'V60 Cross Country', 'V70', 'V90', 'V90 Cross Country', 'XC40', 'XC60', 'XC70', 'XC90']
};

async function main() {
  console.log('=== POPULATING COMPLETE SAHIBINDEN BRANDS AND MODELS ===\n');

  let brandCount = 0;
  let modelCount = 0;

  for (const [brandName, models] of Object.entries(SAHIBINDEN_CATALOG)) {
    // Upsert brand
    const manufacturer = await prisma.manufacturer.upsert({
      where: { name: brandName },
      update: {},
      create: {
        name: brandName,
        popularityScore: 8.0,
      },
    });
    brandCount++;

    for (const modelName of models) {
      await prisma.model.upsert({
        where: {
          manufacturerId_name: {
            manufacturerId: manufacturer.id,
            name: modelName,
          },
        },
        update: {},
        create: {
          name: modelName,
          manufacturerId: manufacturer.id,
          popularityScore: 7.5,
        },
      });
      modelCount++;
    }
  }

  console.log(`Successfully populated ${brandCount} brands and ${modelCount} models!`);
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(async () => {
      await prisma.$disconnect();
    });
}
