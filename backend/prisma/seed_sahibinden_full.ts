import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface VariantSeed {
  name: string;
  engineSize: number;
  horsepower: number;
  torque: number;
  cylinders: number;
  body: string;
  fuel: string;
  trans: string;
  drive: string;
  basePrice: number;
  packages: string[];
}

interface ModelSeed {
  name: string;
  popularityScore: number;
  variants: VariantSeed[];
}

interface BrandSeed {
  brand: string;
  popularityScore: number;
  models: ModelSeed[];
}

export const masterSahibindenData: BrandSeed[] = [
  // ================= 1. BMW =================
  {
    brand: 'BMW',
    popularityScore: 9.6,
    models: [
      {
        name: '1 Serisi',
        popularityScore: 9.2,
        variants: [
          { name: '116d', engineSize: 1496, horsepower: 116, torque: 270, cylinders: 3, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1650000, packages: ['Joy First Edition', 'Sport Line', 'Urban Line', 'M Sport', 'Standart'] },
          { name: '116i', engineSize: 1598, horsepower: 136, torque: 220, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1550000, packages: ['Joy', 'Sport Line', 'Urban Line', 'M Sport', 'Standart'] },
          { name: '118d', engineSize: 1995, horsepower: 150, torque: 320, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1850000, packages: ['Sport Line', 'M Sport', 'Standart'] },
          { name: '118i', engineSize: 1499, horsepower: 140, torque: 220, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1950000, packages: ['First Edition Sport Line', 'First Edition M Sport', 'Sport Line', 'M Sport'] },
          { name: '120d', engineSize: 1995, horsepower: 190, torque: 400, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 2200000, packages: ['M Sport', 'Standart'] },
          { name: 'M135i', engineSize: 1998, horsepower: 306, torque: 450, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 3800000, packages: ['M Performance', 'Standart'] },
        ],
      },
      {
        name: '2 Serisi',
        popularityScore: 8.8,
        variants: [
          { name: '216d Gran Coupe', engineSize: 1496, horsepower: 116, torque: 270, cylinders: 3, body: 'Coupe', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1900000, packages: ['First Edition Sport Line', 'First Edition M Sport'] },
          { name: '218i Active Tourer', engineSize: 1499, horsepower: 136, torque: 220, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1750000, packages: ['Joy', 'Luxury Line', 'M Sport'] },
          { name: '218i Gran Coupe', engineSize: 1499, horsepower: 140, torque: 220, cylinders: 3, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2150000, packages: ['First Edition Sport Line', 'First Edition M Sport', 'M Sport'] },
          { name: '220d Gran Coupe', engineSize: 1995, horsepower: 190, torque: 400, cylinders: 4, body: 'Coupe', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2450000, packages: ['M Sport'] },
        ],
      },
      {
        name: '3 Serisi',
        popularityScore: 9.9,
        variants: [
          { name: '315', engineSize: 1573, horsepower: 75, torque: 110, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Arkadan İtiş', basePrice: 650000, packages: ['Standart'] },
          { name: '316', engineSize: 1766, horsepower: 90, torque: 140, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Arkadan İtiş', basePrice: 700000, packages: ['Standart'] },
          { name: '316Ci', engineSize: 1796, horsepower: 115, torque: 175, cylinders: 4, body: 'Coupe', fuel: 'Benzin', trans: 'Manuel', drive: 'Arkadan İtiş', basePrice: 950000, packages: ['Standart', 'M Sport'] },
          { name: '316i', engineSize: 1598, horsepower: 136, torque: 220, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1850000, packages: ['Advantage', 'Comfort', 'Compact', 'Exclusive', 'Lifestyle Edition', 'Luxury Line', 'M Sport', 'Modern Line', 'Premium', 'Sport', 'Sport Line', 'Technology', 'Techno Plus', 'Touring', 'Standart'] },
          { name: '318Ci', engineSize: 1995, horsepower: 143, torque: 200, cylinders: 4, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1100000, packages: ['Standart', 'M Sport'] },
          { name: '318d', engineSize: 1995, horsepower: 150, torque: 320, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 2100000, packages: ['Advantage', 'Comfort', 'Luxury Line', 'M Sport', 'Sport Line', 'Standart'] },
          { name: '318i', engineSize: 1499, horsepower: 136, torque: 220, cylinders: 3, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 2250000, packages: ['Edition Sport Line', 'Edition M Sport', 'Prestige', 'Sport Line', 'M Sport', 'Standart'] },
          { name: '320Cd', engineSize: 1995, horsepower: 150, torque: 330, cylinders: 4, body: 'Coupe', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1300000, packages: ['Standart', 'M Sport'] },
          { name: '320Ci', engineSize: 2171, horsepower: 170, torque: 210, cylinders: 6, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1350000, packages: ['Standart', 'M Tech'] },
          { name: '320d', engineSize: 1995, horsepower: 190, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 2850000, packages: ['Comfort', 'Exclusive', 'First Edition', 'Executive', 'Executive M Sport', 'Executive Luxury Line', 'Luxury Line', 'Modern Line', 'M Sport', 'Sport Line', 'Techno Plus', 'Standart'] },
          { name: '320i', engineSize: 1597, horsepower: 170, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3250000, packages: ['First Edition', 'First Edition M Sport', 'First Edition Sport Line', 'Executive M Sport', 'Luxury Line', 'Modern Line', 'M Sport', 'Sport Line', 'Techno Plus', 'Standart'] },
          { name: '330d', engineSize: 2993, horsepower: 265, torque: 620, cylinders: 6, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4200000, packages: ['M Sport', 'Standart'] },
          { name: '330i', engineSize: 1998, horsepower: 258, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4400000, packages: ['M Sport', 'Executive M Sport', 'Standart'] },
          { name: '330e', engineSize: 1998, horsepower: 292, torque: 420, cylinders: 4, body: 'Sedan', fuel: 'Hibrit', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4600000, packages: ['M Sport', 'Standart'] },
          { name: 'M340i', engineSize: 2998, horsepower: 374, torque: 500, cylinders: 6, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 6200000, packages: ['M Performance', 'Standart'] },
        ],
      },
      {
        name: '4 Serisi',
        popularityScore: 9.3,
        variants: [
          { name: '420d Gran Coupe', engineSize: 1995, horsepower: 190, torque: 400, cylinders: 4, body: 'Coupe', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3100000, packages: ['M Sport', 'Luxury Line', 'Sport Line'] },
          { name: '420i Coupe', engineSize: 1597, horsepower: 170, torque: 250, cylinders: 4, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3450000, packages: ['M Sport', 'Luxury Line'] },
          { name: '420i Gran Coupe', engineSize: 1597, horsepower: 170, torque: 250, cylinders: 4, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3600000, packages: ['M Sport', 'Edition M Sport'] },
          { name: '430i Coupe', engineSize: 1998, horsepower: 258, torque: 400, cylinders: 4, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4800000, packages: ['M Sport'] },
        ],
      },
      {
        name: '5 Serisi',
        popularityScore: 9.8,
        variants: [
          { name: '520d', engineSize: 1995, horsepower: 190, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3800000, packages: ['Comfort', 'Exclusive', 'Executive', 'Executive M Sport', 'Luxury Line', 'M Sport', 'Special Edition', 'Standart'] },
          { name: '520i', engineSize: 1597, horsepower: 170, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4100000, packages: ['Executive', 'Executive M Sport', 'Executive Luxury Line', 'Luxury Line', 'M Sport', 'Special Edition', 'Standart'] },
          { name: '525d', engineSize: 1995, horsepower: 218, torque: 450, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 3600000, packages: ['M Sport', 'Luxury Line', 'Comfort'] },
          { name: '530d', engineSize: 2993, horsepower: 265, torque: 620, cylinders: 6, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 5200000, packages: ['M Sport', 'Luxury Line'] },
          { name: '530i xDrive', engineSize: 1998, horsepower: 252, torque: 350, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 5500000, packages: ['M Sport', 'Luxury Line', 'Special Edition'] },
        ],
      },
    ],
  },

  // ================= 2. MERCEDES-BENZ =================
  {
    brand: 'Mercedes-Benz',
    popularityScore: 9.7,
    models: [
      {
        name: 'A Serisi',
        popularityScore: 9.1,
        variants: [
          { name: 'A 180', engineSize: 1332, horsepower: 136, torque: 200, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1950000, packages: ['Style', 'Urban', 'AMG Line', 'Progressive'] },
          { name: 'A 180 d', engineSize: 1461, horsepower: 116, torque: 260, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1850000, packages: ['Style', 'Urban', 'AMG Line'] },
          { name: 'A 200', engineSize: 1332, horsepower: 163, torque: 250, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2200000, packages: ['AMG Line', 'Progressive'] },
        ],
      },
      {
        name: 'C Serisi',
        popularityScore: 9.9,
        variants: [
          { name: 'C 180', engineSize: 1496, horsepower: 170, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3200000, packages: ['Selection', 'Avantgarde', 'Fascination', 'Style', 'AMG Line', 'Night Package'] },
          { name: 'C 180 Kompressor', engineSize: 1597, horsepower: 156, torque: 230, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1400000, packages: ['Avantgarde', 'Elegance', 'AMG'] },
          { name: 'C 200 d', engineSize: 1598, horsepower: 136, torque: 320, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 2600000, packages: ['Style', 'Avantgarde', 'Fascination', 'AMG Line'] },
          { name: 'C 200 4MATIC', engineSize: 1496, horsepower: 204, torque: 300, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 3900000, packages: ['Avantgarde', 'AMG Line'] },
          { name: 'C 220 d', engineSize: 1993, horsepower: 200, torque: 440, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4200000, packages: ['Avantgarde', 'AMG Line'] },
          { name: 'C 63 AMG', engineSize: 3982, horsepower: 510, torque: 700, cylinders: 8, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 11000000, packages: ['AMG S', 'Performance'] },
        ],
      },
      {
        name: 'E Serisi',
        popularityScore: 9.8,
        variants: [
          { name: 'E 180', engineSize: 1595, horsepower: 156, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3600000, packages: ['Avantgarde', 'Exclusive', 'AMG Line'] },
          { name: 'E 200 d', engineSize: 1598, horsepower: 160, torque: 360, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3900000, packages: ['Avantgarde', 'Exclusive', 'AMG Line'] },
          { name: 'E 220 d 4MATIC', engineSize: 1993, horsepower: 200, torque: 440, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 5400000, packages: ['Exclusive', 'AMG Line'] },
          { name: 'E 250 CGI', engineSize: 1796, horsepower: 204, torque: 310, cylinders: 4, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1750000, packages: ['Premium AMG', 'Avantgarde', 'Elegance'] },
        ],
      },
    ],
  },

  // ================= 3. AUDI =================
  {
    brand: 'Audi',
    popularityScore: 9.5,
    models: [
      {
        name: 'A3',
        popularityScore: 9.4,
        variants: [
          { name: '30 TFSI', engineSize: 999, horsepower: 110, torque: 200, cylinders: 3, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1950000, packages: ['Advanced', 'S Line'] },
          { name: '35 TFSI', engineSize: 1498, horsepower: 150, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2250000, packages: ['Advanced', 'S Line'] },
          { name: '1.6 TDI', engineSize: 1598, horsepower: 116, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1750000, packages: ['Attraction', 'Ambiente', 'Ambition', 'Dynamic', 'Sport', 'Design', 'S Line'] },
        ],
      },
      {
        name: 'A4',
        popularityScore: 9.3,
        variants: [
          { name: '40 TDI Quattro', engineSize: 1968, horsepower: 204, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 3800000, packages: ['Advanced', 'S Line'] },
          { name: '40 TFSI', engineSize: 1984, horsepower: 204, torque: 320, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 3600000, packages: ['Advanced', 'S Line'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 190, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2400000, packages: ['Design', 'Sport', 'S Line'] },
        ],
      },
      {
        name: 'A6',
        popularityScore: 9.8,
        variants: [
          { name: '40 TDI', engineSize: 1968, horsepower: 204, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 11000000, packages: ['Design', 'Sport', 'S Line', 'Quattro S Line', 'Standart'] },
          { name: '45 TFSI', engineSize: 1984, horsepower: 265, torque: 370, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 11800000, packages: ['Design', 'Sport', 'S Line', 'Quattro S Line'] },
          { name: '50 TFSI e', engineSize: 1984, horsepower: 299, torque: 450, cylinders: 4, body: 'Sedan', fuel: 'Hibrit', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 12800000, packages: ['S Line', 'Quattro S Line'] },
          { name: '55 TFSI', engineSize: 2995, horsepower: 340, torque: 500, cylinders: 6, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 14800000, packages: ['S Line', 'Quattro S Line', 'Design S Line'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 190, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 8500000, packages: ['Design', 'Sport', 'S Line', 'Standart'] },
        ],
      },
      {
        name: 'A7',
        popularityScore: 9.6,
        variants: [
          { name: '40 TDI Quattro', engineSize: 1968, horsepower: 204, torque: 400, cylinders: 4, body: 'Coupe', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 13500000, packages: ['S Line', 'Quattro S Line'] },
          { name: '55 TFSI Quattro', engineSize: 2995, horsepower: 340, torque: 500, cylinders: 6, body: 'Coupe', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 16500000, packages: ['S Line', 'Quattro S Line'] },
        ],
      },
      {
        name: 'A8',
        popularityScore: 9.7,
        variants: [
          { name: '50 TDI Quattro', engineSize: 2998, horsepower: 286, torque: 600, cylinders: 6, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 18500000, packages: ['Long', 'Executive', 'S Line'] },
          { name: '55 TFSI Quattro', engineSize: 2995, horsepower: 340, torque: 500, cylinders: 6, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 20500000, packages: ['Long', 'Executive', 'S Line'] },
        ],
      },
    ],
  },

  // ================= 4. FIAT =================
  {
    brand: 'Fiat',
    popularityScore: 9.9,
    models: [
      {
        name: 'Egea',
        popularityScore: 9.9,
        variants: [
          { name: '1.4 Fire', engineSize: 1368, horsepower: 95, torque: 127, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Easy', 'Urban', 'Lounge', 'Street', 'Limited'] },
          { name: '1.3 Multijet', engineSize: 1248, horsepower: 95, torque: 200, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1350000, packages: ['Easy', 'Urban', 'Lounge'] },
          { name: '1.6 Multijet', engineSize: 1598, horsepower: 130, torque: 320, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Urban', 'Lounge', 'Cross', 'Cross Plus'] },
          { name: '1.5 T4 Hybrid', engineSize: 1469, horsepower: 130, torque: 240, cylinders: 4, body: 'Sedan', fuel: 'Hibrit', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1750000, packages: ['Urban', 'Lounge', 'Cross Plus'] },
        ],
      },
      {
        name: 'Linea',
        popularityScore: 9.5,
        variants: [
          { name: '1.3 Multijet', engineSize: 1248, horsepower: 95, torque: 200, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 750000, packages: ['Active', 'Active Plus', 'Dynamic', 'Emotion', 'Emotion Plus', 'Pop', 'Lounge'] },
          { name: '1.4 Fire', engineSize: 1368, horsepower: 77, torque: 115, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 650000, packages: ['Active', 'Dynamic', 'Pop'] },
          { name: '1.6 Multijet', engineSize: 1598, horsepower: 105, torque: 290, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 850000, packages: ['Dynamic', 'Emotion', 'Lounge'] },
        ],
      },
      {
        name: 'Fiorino',
        popularityScore: 9.6,
        variants: [
          { name: '1.3 Multijet', engineSize: 1248, horsepower: 95, torque: 200, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 850000, packages: ['Pop', 'Emotion', 'Premio'] },
          { name: '1.4 EKO LPG', engineSize: 1368, horsepower: 77, torque: 115, cylinders: 4, body: 'Hatchback', fuel: 'LPG', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 800000, packages: ['Pop', 'Premio'] },
        ],
      },
    ],
  },

  // ================= 5. RENAULT =================
  {
    brand: 'Renault',
    popularityScore: 9.8,
    models: [
      {
        name: 'Clio',
        popularityScore: 9.8,
        variants: [
          { name: '1.0 TCe', engineSize: 999, horsepower: 90, torque: 160, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Joy', 'Touch', 'Icon', 'RS Line', 'Esprit Alpine'] },
          { name: '1.2 16V', engineSize: 1149, horsepower: 75, torque: 107, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 850000, packages: ['Joy', 'Touch', 'Authentique'] },
          { name: '1.5 dCi', engineSize: 1461, horsepower: 90, torque: 220, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1400000, packages: ['Joy', 'Touch', 'Icon'] },
        ],
      },
      {
        name: 'Megane',
        popularityScore: 9.7,
        variants: [
          { name: '1.3 TCe', engineSize: 1332, horsepower: 140, torque: 240, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Joy', 'Joy Plus', 'Touch', 'Icon', 'RS Line'] },
          { name: '1.5 Blue dCi', engineSize: 1461, horsepower: 115, torque: 270, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1850000, packages: ['Touch', 'Icon'] },
          { name: '1.6 16V', engineSize: 1598, horsepower: 115, torque: 156, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1100000, packages: ['Joy', 'Touch', 'Authentique', 'Expression', 'Privilege'] },
        ],
      },
      {
        name: 'Fluence',
        popularityScore: 9.4,
        variants: [
          { name: '1.5 dCi', engineSize: 1461, horsepower: 110, torque: 240, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Joy', 'Touch', 'Icon', 'Business', 'Extreme', 'Dynamique', 'Privilege'] },
          { name: '1.6 16V', engineSize: 1598, horsepower: 115, torque: 156, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 950000, packages: ['Authentique', 'Expression', 'Business'] },
        ],
      },
    ],
  },

  // ================= 6. FORD =================
  {
    brand: 'Ford',
    popularityScore: 9.6,
    models: [
      {
        name: 'Focus',
        popularityScore: 9.7,
        variants: [
          { name: '1.5 TDCi', engineSize: 1499, horsepower: 120, torque: 300, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1750000, packages: ['Trend', 'Trend X', 'Titanium', 'Titanium X', 'ST-Line'] },
          { name: '1.0 EcoBoost', engineSize: 999, horsepower: 125, torque: 170, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Trend X', 'Titanium', 'ST-Line', 'Active'] },
          { name: '1.6 Ti-VCT', engineSize: 1596, horsepower: 125, torque: 159, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Trend', 'Trend X', 'Titanium', 'Ghia'] },
          { name: '1.6 TDCi', engineSize: 1560, horsepower: 115, torque: 270, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Trend', 'Trend X', 'Titanium', 'Titanium X'] },
        ],
      },
      {
        name: 'Fiesta',
        popularityScore: 9.3,
        variants: [
          { name: '1.25', engineSize: 1242, horsepower: 82, torque: 114, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 850000, packages: ['Trend', 'MyFiesta', 'Titanium'] },
          { name: '1.4 TDCi', engineSize: 1399, horsepower: 68, torque: 160, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 800000, packages: ['Trend', 'Titanium'] },
          { name: '1.0 EcoBoost', engineSize: 999, horsepower: 100, torque: 170, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1350000, packages: ['Titanium', 'ST-Line'] },
        ],
      },
    ],
  },

  // ================= 7. PEUGEOT =================
  {
    brand: 'Peugeot',
    popularityScore: 9.4,
    models: [
      {
        name: '208',
        popularityScore: 9.1,
        variants: [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 100, torque: 205, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Active', 'Active Prime', 'Allure', 'Allure Selection', 'GT', 'GT Line'] },
          { name: '1.4 HDi', engineSize: 1398, horsepower: 68, torque: 160, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 750000, packages: ['Access', 'Active'] },
        ],
      },
      {
        name: '3008',
        popularityScore: 9.6,
        variants: [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, cylinders: 4, body: 'SUV', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2350000, packages: ['Active', 'Active Life', 'Allure', 'Allure Dynamic', 'GT', 'GT Line'] },
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, cylinders: 3, body: 'SUV', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2150000, packages: ['Active', 'Allure', 'GT'] },
        ],
      },
    ],
  },

  // ================= 8. OPEL =================
  {
    brand: 'Opel',
    popularityScore: 9.3,
    models: [
      {
        name: 'Corsa',
        popularityScore: 9.4,
        variants: [
          { name: '1.2 Turbo', engineSize: 1199, horsepower: 100, torque: 205, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Edition', 'Elegance', 'GS Line', 'Ultimate'] },
          { name: '1.3 CDTI', engineSize: 1248, horsepower: 95, torque: 210, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 850000, packages: ['Essentia', 'Enjoy', 'Color Edition'] },
        ],
      },
      {
        name: 'Astra',
        popularityScore: 9.6,
        variants: [
          { name: '1.6 CDTI', engineSize: 1598, horsepower: 136, torque: 320, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1550000, packages: ['Edition', 'Design Edition', 'Enjoy', 'Cosmo', 'Excellence', 'Dynamic'] },
          { name: '1.4 Turbo', engineSize: 1364, horsepower: 140, torque: 200, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1350000, packages: ['Enjoy', 'Cosmo', 'Sport'] },
          { name: '1.2 Turbo', engineSize: 1199, horsepower: 130, torque: 230, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1750000, packages: ['Edition', 'Elegance', 'GS Line', 'Ultimate'] },
        ],
      },
    ],
  },

  // ================= 9. TOYOTA =================
  {
    brand: 'Toyota',
    popularityScore: 9.7,
    models: [
      {
        name: 'Corolla',
        popularityScore: 9.9,
        variants: [
          { name: '1.5 Vision', engineSize: 1490, horsepower: 125, torque: 153, cylinders: 3, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1550000, packages: ['Vision', 'Vision Plus', 'Dream', 'Flame', 'Passion'] },
          { name: '1.8 Hybrid', engineSize: 1798, horsepower: 140, torque: 185, cylinders: 4, body: 'Sedan', fuel: 'Hibrit', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2100000, packages: ['Dream', 'Flame', 'Passion', 'Executive'] },
          { name: '1.4 D-4D', engineSize: 1364, horsepower: 90, torque: 205, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Life', 'Touch', 'Comfort', 'Comfort Extra', 'Elegant'] },
          { name: '1.6 Valvematic', engineSize: 1598, horsepower: 132, torque: 160, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1350000, packages: ['Touch', 'Active', 'Advance', 'Premium'] },
        ],
      },
    ],
  },

  // ================= 10. HYUNDAI =================
  {
    brand: 'Hyundai',
    popularityScore: 9.5,
    models: [
      {
        name: 'i20',
        popularityScore: 9.5,
        variants: [
          { name: '1.4 MPI', engineSize: 1368, horsepower: 100, torque: 132, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Jump', 'Style', 'Style Design', 'Elite', 'Elite Smart', 'N Line'] },
          { name: '1.2 MPI', engineSize: 1197, horsepower: 84, torque: 118, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 950000, packages: ['Jump', 'Style'] },
        ],
      },
      {
        name: 'Tucson',
        popularityScore: 9.6,
        variants: [
          { name: '1.6 T-GDI', engineSize: 1598, horsepower: 180, torque: 265, cylinders: 4, body: 'SUV', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 2500000, packages: ['Style', 'Style Plus', 'Elite', 'Elite Plus', 'Prime', 'N Line'] },
          { name: '1.6 CRDi', engineSize: 1598, horsepower: 136, torque: 320, cylinders: 4, body: 'SUV', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 2350000, packages: ['Style', 'Elite', 'Elite Plus'] },
        ],
      },
    ],
  },

  // ================= 11. HONDA =================
  {
    brand: 'Honda',
    popularityScore: 9.5,
    models: [
      {
        name: 'Civic',
        popularityScore: 9.7,
        variants: [
          { name: '1.6 i-VTEC', engineSize: 1597, horsepower: 125, torque: 152, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Dream', 'Elegance', 'Executive', 'Executive+'] },
          { name: '1.5 VTEC Turbo', engineSize: 1498, horsepower: 182, torque: 240, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2150000, packages: ['Elegance', 'Executive', 'Sport'] },
        ],
      },
    ],
  },

  // ================= 12. SKODA =================
  {
    brand: 'Skoda',
    popularityScore: 9.3,
    models: [
      {
        name: 'Octavia',
        popularityScore: 9.6,
        variants: [
          { name: '1.5 TSI', engineSize: 1498, horsepower: 150, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2150000, packages: ['Ambition', 'Style', 'Premium', 'Sportline'] },
          { name: '1.6 TDI', engineSize: 1598, horsepower: 115, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1750000, packages: ['Ambition', 'Style', 'Optimal'] },
        ],
      },
      {
        name: 'Superb',
        popularityScore: 9.6,
        variants: [
          { name: '1.5 TSI', engineSize: 1498, horsepower: 150, torque: 250, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2650000, packages: ['Comfort', 'Ambition', 'Style', 'Prestige', 'L&K'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 190, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 3500000, packages: ['Prestige', 'L&K', 'Sportline'] },
        ],
      },
    ],
  },

  // ================= 13. SEAT =================
  {
    brand: 'Seat',
    popularityScore: 9.1,
    models: [
      {
        name: 'Leon',
        popularityScore: 9.4,
        variants: [
          { name: '1.5 TSI', engineSize: 1498, horsepower: 150, torque: 250, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1950000, packages: ['Style', 'Style Plus', 'FR', 'Xcellence'] },
          { name: '1.6 TDI', engineSize: 1598, horsepower: 115, torque: 250, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1550000, packages: ['Reference', 'Style', 'FR'] },
        ],
      },
    ],
  },

  // ================= 14. DACIA =================
  {
    brand: 'Dacia',
    popularityScore: 9.2,
    models: [
      {
        name: 'Duster',
        popularityScore: 9.6,
        variants: [
          { name: '1.5 dCi', engineSize: 1461, horsepower: 115, torque: 260, cylinders: 4, body: 'SUV', fuel: 'Dizel', trans: 'Manuel', drive: '4x4', basePrice: 1450000, packages: ['Essential', 'Comfort', 'Prestige', 'Journey', 'Extreme'] },
          { name: '1.3 TCe', engineSize: 1332, horsepower: 150, torque: 250, cylinders: 4, body: 'SUV', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1550000, packages: ['Comfort', 'Prestige', 'Extreme'] },
        ],
      },
      {
        name: 'Sandero',
        popularityScore: 9.3,
        variants: [
          { name: '1.0 TCe Stepway', engineSize: 999, horsepower: 90, torque: 160, cylinders: 3, body: 'Hatchback 5 kapı', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Essential', 'Comfort', 'Expression'] },
        ],
      },
    ],
  },

  // ================= 15. ALFA ROMEO =================
  {
    brand: 'Alfa Romeo',
    popularityScore: 8.8,
    models: [
      {
        name: 'Giulietta',
        popularityScore: 9.0,
        variants: [
          { name: '1.4 TB', engineSize: 1368, horsepower: 120, torque: 206, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Progression', 'Distinctive', 'Sprint'] },
          { name: '1.6 JTD', engineSize: 1598, horsepower: 120, torque: 320, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Progression', 'Distinctive', 'Super'] },
        ],
      },
    ],
  },

  // ================= 16. CHERY =================
  {
    brand: 'Chery',
    popularityScore: 9.3,
    models: [
      {
        name: 'Omoda 5',
        popularityScore: 9.4,
        variants: [
          { name: '1.6 TGDI', engineSize: 1598, horsepower: 183, torque: 275, cylinders: 4, body: 'SUV', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Comfort', 'Luxury', 'Excellent'] },
        ],
      },
      {
        name: 'Tiggo 8 Pro',
        popularityScore: 9.5,
        variants: [
          { name: '1.6 TGDI', engineSize: 1598, horsepower: 183, torque: 275, cylinders: 4, body: 'SUV', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2150000, packages: ['Luxury', 'Excellent', 'Avantgarde'] },
        ],
      },
    ],
  },

  // ================= 17. TOGG =================
  {
    brand: 'TOGG',
    popularityScore: 9.7,
    models: [
      {
        name: 'T10X',
        popularityScore: 9.8,
        variants: [
          { name: 'V1 RWD', engineSize: 0, horsepower: 218, torque: 350, cylinders: 0, body: 'SUV', fuel: 'Elektrik', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1450000, packages: ['Standart'] },
          { name: 'V2 RWD Uzun Menzil', engineSize: 0, horsepower: 218, torque: 350, cylinders: 0, body: 'SUV', fuel: 'Elektrik', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1850000, packages: ['Standart', 'Launch Edition'] },
        ],
      },
    ],
  },

  // ================= 18. TESLA =================
  {
    brand: 'Tesla',
    popularityScore: 9.5,
    models: [
      {
        name: 'Model Y',
        popularityScore: 9.7,
        variants: [
          { name: 'RWD', engineSize: 0, horsepower: 299, torque: 420, cylinders: 0, body: 'SUV', fuel: 'Elektrik', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 1850000, packages: ['Standart', 'Autopilot'] },
          { name: 'Long Range AWD', engineSize: 0, horsepower: 514, torque: 493, cylinders: 0, body: 'SUV', fuel: 'Elektrik', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 3200000, packages: ['Standart', 'Autopilot'] },
        ],
      },
    ],
  },
];

export async function seedSahibindenMasterData() {
  console.log('--- SEEDING EXTENDED SAHIBINDEN AUTOMOTIVE DATASET FOR ALL POPULAR BRANDS ---');

  const fuels = ['Benzin', 'Dizel', 'Hibrit', 'Elektrik', 'LPG'];
  const transmissions = ['Manuel', 'Otomatik', 'Yarı Otomatik'];
  const bodies = ['Sedan', 'Hatchback', 'Hatchback 5 kapı', 'SUV', 'Coupe', 'Station Wagon', 'Cabrio'];
  const drives = ['Önden Çekiş', 'Arkadan İtiş', '4x4', '4 Çeker (xDrive)', '4 Çeker (AWD)'];

  for (const f of fuels) await prisma.fuelType.upsert({ where: { name: f }, update: {}, create: { name: f } });
  for (const t of transmissions) await prisma.transmissionType.upsert({ where: { name: t }, update: {}, create: { name: t } });
  for (const b of bodies) await prisma.bodyType.upsert({ where: { name: b }, update: {}, create: { name: b } });
  for (const d of drives) await prisma.driveType.upsert({ where: { name: d }, update: {}, create: { name: d } });

  const fuelMap = Object.fromEntries((await prisma.fuelType.findMany()).map((x) => [x.name, x.id]));
  const transMap = Object.fromEntries((await prisma.transmissionType.findMany()).map((x) => [x.name, x.id]));
  const bodyMap = Object.fromEntries((await prisma.bodyType.findMany()).map((x) => [x.name, x.id]));
  const driveMap = Object.fromEntries((await prisma.driveType.findMany()).map((x) => [x.name, x.id]));

  const years = [2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

  for (const bData of masterSahibindenData) {
    const mfg = await prisma.manufacturer.upsert({
      where: { name: bData.brand },
      update: { popularityScore: bData.popularityScore },
      create: { name: bData.brand, popularityScore: bData.popularityScore },
    });

    for (const mData of bData.models) {
      const model = await prisma.model.upsert({
        where: {
          manufacturerId_name: {
            manufacturerId: mfg.id,
            name: mData.name,
          },
        },
        update: { popularityScore: mData.popularityScore },
        create: {
          name: mData.name,
          manufacturerId: mfg.id,
          popularityScore: mData.popularityScore,
        },
      });

      for (const vData of mData.variants) {
        const variant = await prisma.variant.upsert({
          where: {
            modelId_name: {
              modelId: model.id,
              name: vData.name,
            },
          },
          update: {
            engineSize: vData.engineSize,
            horsepower: vData.horsepower,
            torque: vData.torque,
            cylinders: vData.cylinders,
          },
          create: {
            name: vData.name,
            modelId: model.id,
            engineSize: vData.engineSize,
            horsepower: vData.horsepower,
            torque: vData.torque,
            cylinders: vData.cylinders,
          },
        });

        for (const pkgName of vData.packages) {
          const pkg = await prisma.package.upsert({
            where: {
              variantId_name: {
                variantId: variant.id,
                name: pkgName,
              },
            },
            update: {},
            create: {
              name: pkgName,
              variantId: variant.id,
            },
          });

          for (const yr of years) {
            const depreciationRatio = Math.pow(0.92, 2026 - yr);
            const fairValue = Math.round(vData.basePrice * depreciationRatio);

            const existingSpec = await prisma.vehicleSpecification.findFirst({
              where: {
                manufacturerId: mfg.id,
                modelId: model.id,
                variantId: variant.id,
                packageId: pkg.id,
                year: yr,
              },
            });

            if (existingSpec) {
              await prisma.vehicleSpecification.update({
                where: { id: existingSpec.id },
                data: { originalMSRP: fairValue },
              });
            } else {
              await prisma.vehicleSpecification.create({
                data: {
                  manufacturerId: mfg.id,
                  modelId: model.id,
                  variantId: variant.id,
                  packageId: pkg.id,
                  year: yr,
                  fuelTypeId: fuelMap[vData.fuel] || fuelMap['Benzin'],
                  transmissionTypeId: transMap[vData.trans] || transMap['Otomatik'],
                  bodyTypeId: bodyMap[vData.body] || bodyMap['Sedan'],
                  driveTypeId: driveMap[vData.drive] || driveMap['Önden Çekiş'],
                  originalMSRP: fairValue,
                },
              });
            }
          }
        }
      }
    }
  }

  console.log('--- ALL POPULAR AUTOMOTIVE BRANDS SEEDED SUCCESSFULLY ---');
}

if (require.main === module) {
  seedSahibindenMasterData().finally(() => prisma.$disconnect());
}
