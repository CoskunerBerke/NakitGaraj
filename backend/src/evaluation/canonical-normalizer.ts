export interface CanonicalVehicleInfo {
  canonicalMake: string;
  canonicalModel: string;
  canonicalVariant: string | null;
  canonicalTrim: string | null;
  canonicalBodyType: string | null;
  canonicalFuelType: string | null;
  canonicalTransmission: string | null;
  isValid: boolean;
  quarantineReason?: string;
}

export class CanonicalNormalizer {
  private static JUNK_PATTERNS = [
    /sahibinden\.com'da/gi,
    /sahibinden\.com/gi,
    /\.com'da/gi,
    /& Modelleri/gi,
    /& Modleri/gi,
    /Modelleri/gi,
    /Modleri/gi,
    /2\.El Arabalar/gi,
    /2\.El/gi,
    /Satılık Sıfır Km/gi,
    /Satılık/gi,
    /Sıfır Km/gi,
    /Otomobil/gi,
    /fiyatları/gi,
    /fiyatlari/gi,
    /arama sonucu/gi,
    /sayfa numarası/gi,
    /ikinci el/gi,
    /FarkliVaryant/gi,
    /Genel Model/gi,
  ];

  /**
   * Cleans raw text strings by stripping known scrape metadata artifacts
   */
  static cleanString(str: string): string {
    if (!str) return '';
    let cleaned = str;
    for (const pattern of this.JUNK_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Determines if a string is numeric-only (e.g. "156", "159", "206") which are models/numbers, not variants
   */
  static isNumericOnly(str: string): boolean {
    return /^\d+$/.test(str.trim());
  }

  /**
   * Normalizes raw make, model, variant, title into canonical structured terms
   */
  static normalize(rawMake: string, rawModel: string, rawVariant?: string, rawTitle?: string): CanonicalVehicleInfo {
    const cleanMakeRaw = this.cleanString(rawMake);
    const cleanModelRaw = this.cleanString(rawModel);
    const cleanVariantRaw = rawVariant ? this.cleanString(rawVariant) : '';
    const cleanTitleRaw = rawTitle ? this.cleanString(rawTitle) : '';

    let canonicalMake = cleanMakeRaw;

    // Brand normalization
    const upperMake = cleanMakeRaw.toUpperCase();
    if (upperMake.includes('ALFA')) canonicalMake = 'Alfa Romeo';
    else if (upperMake.includes('AUDI')) canonicalMake = 'Audi';
    else if (upperMake.includes('BMW')) canonicalMake = 'BMW';
    else if (upperMake.includes('BYD')) canonicalMake = 'BYD';
    else if (upperMake.includes('CHEVROLET')) canonicalMake = 'Chevrolet';
    else if (upperMake.includes('CITROEN') || upperMake.includes('CITROËN')) canonicalMake = 'Citroen';
    else if (upperMake.includes('CUPRA')) canonicalMake = 'Cupra';
    else if (upperMake.includes('DACIA')) canonicalMake = 'Dacia';
    else if (upperMake.includes('DAIHATSU')) canonicalMake = 'Daihatsu';
    else if (upperMake.includes('DS')) canonicalMake = 'DS Automobiles';
    else if (upperMake.includes('FORD')) canonicalMake = 'Ford';
    else if (upperMake.includes('HYUNDAI')) canonicalMake = 'Hyundai';
    else if (upperMake.includes('MERCEDES')) canonicalMake = 'Mercedes-Benz';
    else if (upperMake.includes('OPEL')) canonicalMake = 'Opel';
    else if (upperMake.includes('PEUGEOT')) canonicalMake = 'Peugeot';
    else if (upperMake.includes('RENAULT')) canonicalMake = 'Renault';
    else if (upperMake.includes('SEAT')) canonicalMake = 'Seat';
    else if (upperMake.includes('SKODA') || upperMake.includes('ŠKODA')) canonicalMake = 'Skoda';
    else if (upperMake.includes('TOYOTA')) canonicalMake = 'Toyota';
    else if (upperMake.includes('VOLKSWAGEN') || upperMake.includes('VW')) canonicalMake = 'Volkswagen';

    if (!canonicalMake || canonicalMake.length < 2) {
      return {
        canonicalMake: rawMake,
        canonicalModel: rawModel,
        canonicalVariant: null,
        canonicalTrim: null,
        canonicalBodyType: null,
        canonicalFuelType: null,
        canonicalTransmission: null,
        isValid: false,
        quarantineReason: 'GEÇERSİZ_MARKA_TESPİTİ',
      };
    }

    // Model normalization
    let canonicalModel = cleanModelRaw;

    if (canonicalMake === 'Audi') {
      if (cleanModelRaw.toUpperCase().includes('A3') || cleanTitleRaw.toUpperCase().includes('A3')) canonicalModel = 'A3';
      else if (cleanModelRaw.toUpperCase().includes('A4') || cleanTitleRaw.toUpperCase().includes('A4')) canonicalModel = 'A4';
      else if (cleanModelRaw.toUpperCase().includes('A5') || cleanTitleRaw.toUpperCase().includes('A5')) canonicalModel = 'A5';
      else if (cleanModelRaw.toUpperCase().includes('A6') || cleanTitleRaw.toUpperCase().includes('A6')) canonicalModel = 'A6';
      else if (cleanModelRaw.toUpperCase().includes('Q3') || cleanTitleRaw.toUpperCase().includes('Q3')) canonicalModel = 'Q3';
      else if (cleanModelRaw.toUpperCase().includes('Q5') || cleanTitleRaw.toUpperCase().includes('Q5')) canonicalModel = 'Q5';
      else if (cleanModelRaw.toUpperCase().includes('Q7') || cleanTitleRaw.toUpperCase().includes('Q7')) canonicalModel = 'Q7';
    } else if (canonicalMake === 'BMW') {
      if (cleanModelRaw.toUpperCase().includes('3 SER') || cleanModelRaw.includes('320') || cleanTitleRaw.includes('320')) canonicalModel = '3 Serisi';
      else if (cleanModelRaw.toUpperCase().includes('5 SER') || cleanModelRaw.includes('520') || cleanTitleRaw.includes('520')) canonicalModel = '5 Serisi';
      else if (cleanModelRaw.toUpperCase().includes('1 SER') || cleanModelRaw.includes('116')) canonicalModel = '1 Serisi';
      else if (cleanModelRaw.toUpperCase().includes('4 SER') || cleanModelRaw.includes('420')) canonicalModel = '4 Serisi';
      else if (cleanModelRaw.toUpperCase().includes('X5')) canonicalModel = 'X5';
      else if (cleanModelRaw.toUpperCase().includes('X3')) canonicalModel = 'X3';
    } else if (canonicalMake === 'Citroen') {
      if (cleanModelRaw.toUpperCase().includes('C4') || cleanTitleRaw.toUpperCase().includes('C4')) canonicalModel = 'C4';
      else if (cleanModelRaw.toUpperCase().includes('C3') || cleanTitleRaw.toUpperCase().includes('C3')) canonicalModel = 'C3';
      else if (cleanModelRaw.toUpperCase().includes('C5') || cleanTitleRaw.toUpperCase().includes('C5')) canonicalModel = 'C5';
      else if (cleanModelRaw.toUpperCase().includes('ELYSEE') || cleanModelRaw.toUpperCase().includes('C ELYS')) canonicalModel = 'C-Elysée';
    } else if (canonicalMake === 'Dacia') {
      if (cleanModelRaw.toUpperCase().includes('DUSTER')) canonicalModel = 'Duster';
      else if (cleanModelRaw.toUpperCase().includes('SANDERO')) canonicalModel = 'Sandero';
      else if (cleanModelRaw.toUpperCase().includes('LOGAN')) canonicalModel = 'Logan';
      else if (cleanModelRaw.toUpperCase().includes('LODGY')) canonicalModel = 'Lodgy';
    } else if (canonicalMake === 'Chevrolet') {
      if (cleanModelRaw.toUpperCase().includes('CRUZE')) canonicalModel = 'Cruze';
      else if (cleanModelRaw.toUpperCase().includes('AVEO')) canonicalModel = 'Aveo';
      else if (cleanModelRaw.toUpperCase().includes('CAPTIVA')) canonicalModel = 'Captiva';
      else if (cleanModelRaw.toUpperCase().includes('SPARK')) canonicalModel = 'Spark';
    } else if (canonicalMake === 'Alfa Romeo') {
      if (cleanModelRaw.toUpperCase().includes('GIULIETTA')) canonicalModel = 'Giulietta';
      else if (cleanModelRaw.toUpperCase().includes('156') || cleanVariantRaw === '156') canonicalModel = '156';
      else if (cleanModelRaw.toUpperCase().includes('159') || cleanVariantRaw === '159') canonicalModel = '159';
      else if (cleanModelRaw.toUpperCase().includes('MITO')) canonicalModel = 'MiTo';
    } else if (canonicalMake === 'Peugeot') {
      if (cleanModelRaw.includes('206')) canonicalModel = '206';
      else if (cleanModelRaw.includes('207')) canonicalModel = '207';
      else if (cleanModelRaw.includes('208')) canonicalModel = '208';
      else if (cleanModelRaw.includes('301')) canonicalModel = '301';
      else if (cleanModelRaw.includes('308')) canonicalModel = '308';
      else if (cleanModelRaw.includes('3008')) canonicalModel = '3008';
    } else if (canonicalMake === 'Renault') {
      if (cleanModelRaw.toUpperCase().includes('CLIO')) canonicalModel = 'Clio';
      else if (cleanModelRaw.toUpperCase().includes('MEGANE') || cleanModelRaw.toUpperCase().includes('MÉGANE')) canonicalModel = 'Megane';
      else if (cleanModelRaw.toUpperCase().includes('SYMBOL')) canonicalModel = 'Symbol';
      else if (cleanModelRaw.toUpperCase().includes('FLUENCE')) canonicalModel = 'Fluence';
      else if (cleanModelRaw.toUpperCase().includes('CADJAR') || cleanModelRaw.toUpperCase().includes('KADJAR')) canonicalModel = 'Kadjar';
    }

    if (!canonicalModel || canonicalModel.length < 2 || canonicalModel === 'Genel Model') {
      return {
        canonicalMake,
        canonicalModel: rawModel,
        canonicalVariant: null,
        canonicalTrim: null,
        canonicalBodyType: null,
        canonicalFuelType: null,
        canonicalTransmission: null,
        isValid: false,
        quarantineReason: 'GEÇERSİZ_MODEL_TESPİTİ',
      };
    }

    // Variant normalization
    let canonicalVariant: string | null = cleanVariantRaw;
    if (!canonicalVariant || canonicalVariant === 'Standart' || canonicalVariant === 'FarkliVaryant' || canonicalVariant === 'Genel Model' || this.isNumericOnly(canonicalVariant)) {
      canonicalVariant = null;
    }

    return {
      canonicalMake,
      canonicalModel,
      canonicalVariant,
      canonicalTrim: null,
      canonicalBodyType: null,
      canonicalFuelType: null,
      canonicalTransmission: null,
      isValid: true,
    };
  }
}
