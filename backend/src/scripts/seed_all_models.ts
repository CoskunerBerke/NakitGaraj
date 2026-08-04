import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const majorCatalog = [
  { brand: 'Alfa Romeo', models: ['147', '156', '159', 'Giulia', 'Giulietta', 'Mito', 'Stelvio', 'Tonale'] },
  { brand: 'Audi', models: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'R8', 'TT'] },
  { brand: 'BMW', models: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'i8', 'iX'] },
  { brand: 'Chery', models: ['Alia', 'Chance', 'Kimo', 'Omoda 5', 'Tiggo 3', 'Tiggo 4 Pro', 'Tiggo 7 Pro', 'Tiggo 8 Pro'] },
  { brand: 'Chevrolet', models: ['Aveo', 'Camaro', 'Captiva', 'Cruze', 'Epica', 'Kalos', 'Lacetti', 'Spark', 'Trax'] },
  { brand: 'Citroen', models: ['C-Elysee', 'C1', 'C2', 'C3', 'C3 Aircross', 'C3 Picasso', 'C4', 'C4 Aircross', 'C4 Cactus', 'C4 Picasso', 'C5', 'C5 Aircross', 'DS3', 'DS4', 'DS5', 'Saxo', 'Xsara'] },
  { brand: 'Cupra', models: ['Born', 'Formentor', 'Leon'] },
  { brand: 'Dacia', models: ['Duster', 'Jogger', 'Lodgy', 'Logan', 'Sandero', 'Solenza', 'Spring'] },
  { brand: 'Fiat', models: ['124 Spider', '500', '500L', '500X', 'Albea', 'Bravo', 'Doblo', 'Egea', 'Fiorino', 'Freemont', 'Idea', 'Linea', 'Marea', 'Palio', 'Panda', 'Punto', 'Siena', 'Stilo', 'Tempra', 'Tipo', 'Uno'] },
  { brand: 'Ford', models: ['B-Max', 'C-Max', 'Escort', 'Fiesta', 'Focus', 'Fusion', 'Galaxy', 'Ka', 'Kuga', 'Mondeo', 'Mustang', 'Puma', 'S-Max', 'Taunus'] },
  { brand: 'Honda', models: ['Accord', 'Civic', 'CR-V', 'City', 'HR-V', 'Jazz', 'Prelude', 'S2000'] },
  { brand: 'Hyundai', models: ['Accent', 'Accent Blue', 'Accent Era', 'Atos', 'Bayon', 'Coupe', 'Elantra', 'Getz', 'Genesis', 'i10', 'i20', 'i30', 'i40', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Kona', 'Matrix', 'Santa Fe', 'Sonata', 'Tucson'] },
  { brand: 'Jaguar', models: ['F-Pace', 'F-Type', 'I-Pace', 'XE', 'XF', 'XJ'] },
  { brand: 'Jeep', models: ['Cherokee', 'Compass', 'Grand Cherokee', 'Patriot', 'Renegade', 'Wrangler'] },
  { brand: 'Kia', models: ['Ceed', 'Cerato', 'EV6', 'Niro', 'Picanto', 'Rio', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Stonic', 'Venga'] },
  { brand: 'Land Rover', models: ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'] },
  { brand: 'Maserati', models: ['Ghibli', 'GranCabrio', 'GranTurismo', 'Grecale', 'Levante', 'Quattroporte'] },
  { brand: 'Mazda', models: ['2', '3', '5', '6', 'CX-3', 'CX-5', 'CX-9', 'MX-5', 'RX-8'] },
  { brand: 'Mercedes-Benz', models: ['A-Class', 'B-Class', 'C-Class', 'CL', 'CLA', 'CLK', 'CLS', 'E-Class', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'G-Class', 'GL', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'S-Class', 'SL', 'SLC', 'SLK'] },
  { brand: 'MG', models: ['4', '5', 'E-HS', 'HS', 'Marvel R', 'ZS'] },
  { brand: 'Mini', models: ['Clubman', 'Cooper', 'Countryman', 'Paceman'] },
  { brand: 'Nissan', models: ['Almera', 'Juke', 'Micra', 'Note', 'Pathfinder', 'Primera', 'Pulsar', 'Qashqai', 'Sunny', 'X-Trail'] },
  { brand: 'Opel', models: ['Adam', 'Ampera', 'Antara', 'Astra', 'Cascada', 'Corsa', 'Crossland', 'Grandland', 'Insignia', 'Meriva', 'Mokka', 'Tigra', 'Vectra', 'Zafira'] },
  { brand: 'Peugeot', models: ['106', '107', '206', '207', '208', '301', '307', '308', '407', '508', '2008', '3008', '5008', 'RCZ'] },
  { brand: 'Porsche', models: ['718 Boxster', '718 Cayman', '911', 'Boxster', 'Cayenne', 'Cayman', 'Macan', 'Panamera', 'Taycan'] },
  { brand: 'Renault', models: ['Austral', 'Captur', 'Clio', 'Fluence', 'Kadjar', 'Koleos', 'Laguna', 'Latitude', 'Megane', 'Modus', 'Safrane', 'Scenic', 'Symbol', 'Talisman', 'Twingo', 'Zoe'] },
  { brand: 'Seat', models: ['Alhambra', 'Altea', 'Arona', 'Ateca', 'Cordoba', 'Ibiza', 'Leon', 'Tarraco', 'Toledo'] },
  { brand: 'Skoda', models: ['Fabia', 'Favorit', 'Felicia', 'Kamiq', 'Karoq', 'Kodiaq', 'Octavia', 'Rapid', 'Roomster', 'Scala', 'Superb', 'Yeti'] },
  { brand: 'Subaru', models: ['BRZ', 'Forester', 'Impreza', 'Legacy', 'Outback', 'XV'] },
  { brand: 'Suzuki', models: ['Alto', 'Baleno', 'Jimny', 'S-Cross', 'Splash', 'Swift', 'Vitara', 'Wagon R'] },
  { brand: 'Tesla', models: ['Model 3', 'Model S', 'Model X', 'Model Y'] },
  { brand: 'Togg', models: ['T10X'] },
  { brand: 'Toyota', models: ['Auris', 'Avensis', 'C-HR', 'Camry', 'Carina', 'Celica', 'Corolla', 'Corona', 'Cressida', 'GT86', 'Land Cruiser', 'MR2', 'Picnic', 'Prius', 'RAV4', 'Starlet', 'Supra', 'Tercel', 'Urban Cruiser', 'Verso', 'Yaris'] },
  { brand: 'Volvo', models: ['C30', 'C70', 'S40', 'S60', 'S80', 'S90', 'V40', 'V40 Cross Country', 'V60', 'V90', 'XC40', 'XC60', 'XC90'] },
  { brand: 'Volkswagen', models: ['Arteon', 'Bora', 'Beetle', 'Golf', 'ID.3', 'ID.4', 'Jetta', 'Lupo', 'Passat', 'Passat Variant', 'Polo', 'Scirocco', 'Sharan', 'T-Roc', 'Tiguan', 'Touareg', 'Touran'] }
];

async function run() {
  console.log('--- Starting Database Seeding for ALL Sahibinden.com Brands and Models ---');
  
  let brandCount = 0;
  let modelCount = 0;

  for (const item of majorCatalog) {
    // Upsert Brand
    const mfg = await prisma.manufacturer.upsert({
      where: { name: item.brand },
      update: {},
      create: { 
        name: item.brand,
        popularityScore: 7.5
      }
    });
    brandCount++;

    // Upsert Models
    for (const modelName of item.models) {
      await prisma.model.upsert({
        where: {
          manufacturerId_name: {
            manufacturerId: mfg.id,
            name: modelName
          }
        },
        update: {},
        create: {
          name: modelName,
          manufacturerId: mfg.id,
          popularityScore: 7.0
        }
      });
      modelCount++;
    }
  }

  console.log(`\n--- Seeding Completed successfully! ---`);
  console.log(`Total Brands seeded: ${brandCount}`);
  console.log(`Total Models seeded: ${modelCount}`);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
