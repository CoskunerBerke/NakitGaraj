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

    // 1. Remove page suffix patterns like " - 4", " - 10", " - 2"
    cleaned = cleaned.replace(/\s*-\s*\d+$/g, '');

    // 2. Remove standard junk patterns
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
    const upperModel = cleanModelRaw.toUpperCase();
    const upperTitle = cleanTitleRaw.toUpperCase();

    // Check specific brand/model extraction mappings (Requirement 3 & 4)
    if (canonicalMake === 'DS Automobiles') {
      if (upperModel.includes('DS 3') || upperModel.includes('DS3') || upperTitle.includes('DS 3') || upperTitle.includes('DS3')) {
        canonicalModel = 'DS 3';
      } else if (upperModel.includes('DS 4') || upperModel.includes('DS4') || upperTitle.includes('DS 4') || upperTitle.includes('DS4')) {
        canonicalModel = 'DS 4';
      } else if (upperModel.includes('DS 7') || upperModel.includes('DS7') || upperTitle.includes('DS 7') || upperTitle.includes('DS7')) {
        canonicalModel = 'DS 7';
      } else if (upperModel.includes('DS 9') || upperModel.includes('DS9') || upperTitle.includes('DS 9') || upperTitle.includes('DS9')) {
        canonicalModel = 'DS 9';
      } else {
        // Just brand name or page without model name
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
    } else if (canonicalMake === 'BYD') {
      if (upperModel.includes('ATTO 3') || upperModel.includes('ATTO3') || upperTitle.includes('ATTO 3') || upperTitle.includes('ATTO3')) {
        canonicalModel = 'Atto 3';
      } else if (upperModel.includes('SEAL') || upperTitle.includes('SEAL')) {
        canonicalModel = 'Seal';
      } else if (upperModel.includes('HAN') || upperTitle.includes('HAN')) {
        canonicalModel = 'Han';
      } else if (upperModel.includes('DOLPHIN') || upperTitle.includes('DOLPHIN')) {
        canonicalModel = 'Dolphin';
      } else if (upperModel.includes('TANG') || upperTitle.includes('TANG')) {
        canonicalModel = 'Tang';
      } else {
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
    } else if (canonicalMake === 'Cupra') {
      if (upperModel.includes('FORMENTOR') || upperTitle.includes('FORMENTOR')) {
        canonicalModel = 'Formentor';
      } else if (upperModel.includes('LEON') || upperTitle.includes('LEON')) {
        canonicalModel = 'Leon';
      } else if (upperModel.includes('BORN') || upperTitle.includes('BORN')) {
        canonicalModel = 'Born';
      } else if (upperModel.includes('ATECA') || upperTitle.includes('ATECA')) {
        canonicalModel = 'Ateca';
      } else {
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
    } else if (canonicalMake === 'Daihatsu') {
      if (upperModel.includes('SIRION') || upperTitle.includes('SIRION')) {
        canonicalModel = 'Sirion';
      } else if (upperModel.includes('TERIOS') || upperTitle.includes('TERIOS')) {
        canonicalModel = 'Terios';
      } else if (upperModel.includes('CUORE') || upperTitle.includes('CUORE')) {
        canonicalModel = 'Cuore';
      } else if (upperModel.includes('COPEN') || upperTitle.includes('COPEN')) {
        canonicalModel = 'Copen';
      } else if (upperModel.includes('MATERIA') || upperTitle.includes('MATERIA')) {
        canonicalModel = 'Materia';
      } else {
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
    } else if (canonicalMake === 'Audi') {
      if (upperModel.includes('A3') || upperTitle.includes('A3')) canonicalModel = 'A3';
      else if (upperModel.includes('A4') || upperTitle.includes('A4')) canonicalModel = 'A4';
      else if (upperModel.includes('A5') || upperTitle.includes('A5')) canonicalModel = 'A5';
      else if (upperModel.includes('A6') || upperTitle.includes('A6')) canonicalModel = 'A6';
      else if (upperModel.includes('Q3') || upperTitle.includes('Q3')) canonicalModel = 'Q3';
      else if (upperModel.includes('Q5') || upperTitle.includes('Q5')) canonicalModel = 'Q5';
      else if (upperModel.includes('Q7') || upperTitle.includes('Q7')) canonicalModel = 'Q7';
    } else if (canonicalMake === 'BMW') {
      if (upperModel.includes('3 SER') || cleanModelRaw.includes('320') || cleanTitleRaw.includes('320')) canonicalModel = '3 Serisi';
      else if (upperModel.includes('5 SER') || cleanModelRaw.includes('520') || cleanTitleRaw.includes('520')) canonicalModel = '5 Serisi';
      else if (upperModel.includes('1 SER') || cleanModelRaw.includes('116')) canonicalModel = '1 Serisi';
      else if (upperModel.includes('4 SER') || cleanModelRaw.includes('420')) canonicalModel = '4 Serisi';
      else if (upperModel.includes('X5')) canonicalModel = 'X5';
      else if (upperModel.includes('X3')) canonicalModel = 'X3';
    } else if (canonicalMake === 'Citroen') {
      if (upperModel.includes('C4') || upperTitle.includes('C4')) canonicalModel = 'C4';
      else if (upperModel.includes('C3') || upperTitle.includes('C3')) canonicalModel = 'C3';
      else if (upperModel.includes('C5') || upperTitle.includes('C5')) canonicalModel = 'C5';
      else if (upperModel.includes('ELYSEE') || upperModel.includes('C ELYS')) canonicalModel = 'C-Elysée';
    } else if (canonicalMake === 'Dacia') {
      if (upperModel.includes('DUSTER')) canonicalModel = 'Duster';
      else if (upperModel.includes('SANDERO')) canonicalModel = 'Sandero';
      else if (upperModel.includes('LOGAN')) canonicalModel = 'Logan';
      else if (upperModel.includes('LODGY')) canonicalModel = 'Lodgy';
    } else if (canonicalMake === 'Chevrolet') {
      if (upperModel.includes('CRUZE')) canonicalModel = 'Cruze';
      else if (upperModel.includes('AVEO')) canonicalModel = 'Aveo';
      else if (upperModel.includes('CAPTIVA')) canonicalModel = 'Captiva';
      else if (upperModel.includes('SPARK')) canonicalModel = 'Spark';
    } else if (canonicalMake === 'Alfa Romeo') {
      if (upperModel.includes('GIULIETTA')) canonicalModel = 'Giulietta';
      else if (upperModel.includes('156') || cleanVariantRaw === '156') canonicalModel = '156';
      else if (upperModel.includes('159') || cleanVariantRaw === '159') canonicalModel = '159';
      else if (upperModel.includes('MITO')) canonicalModel = 'MiTo';
    } else if (canonicalMake === 'Peugeot') {
      if (cleanModelRaw.includes('206')) canonicalModel = '206';
      else if (cleanModelRaw.includes('207')) canonicalModel = '207';
      else if (cleanModelRaw.includes('208')) canonicalModel = '208';
      else if (cleanModelRaw.includes('301')) canonicalModel = '301';
      else if (cleanModelRaw.includes('308')) canonicalModel = '308';
      else if (cleanModelRaw.includes('3008')) canonicalModel = '3008';
    } else if (canonicalMake === 'Renault') {
      if (upperModel.includes('CLIO')) canonicalModel = 'Clio';
      else if (upperModel.includes('MEGANE') || upperModel.includes('MÉGANE')) canonicalModel = 'Megane';
      else if (upperModel.includes('SYMBOL')) canonicalModel = 'Symbol';
      else if (upperModel.includes('FLUENCE')) canonicalModel = 'Fluence';
      else if (upperModel.includes('CADJAR') || upperModel.includes('KADJAR')) canonicalModel = 'Kadjar';
    }

    // Quarantine if model name is empty, generic model, or identical to brand name (not specific)
    const normalizedModelUpper = canonicalModel.toUpperCase();
    const normalizedMakeUpper = canonicalMake.toUpperCase();

    if (
      !canonicalModel ||
      canonicalModel.length < 2 ||
      canonicalModel === 'Genel Model' ||
      normalizedModelUpper === normalizedMakeUpper ||
      normalizedModelUpper === normalizedMakeUpper.replace(/\s+/g, '') ||
      normalizedModelUpper.replace(/\s+/g, '') === normalizedMakeUpper ||
      normalizedModelUpper.includes('SAHIBINDEN') ||
      normalizedModelUpper.includes('MODELLERI') ||
      normalizedModelUpper.includes('MODLERI') ||
      normalizedModelUpper.includes('FARK LIVARYANT') ||
      normalizedModelUpper.includes('FARKLIVARYANT')
    ) {
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
    if (
      !canonicalVariant ||
      canonicalVariant === 'Standart' ||
      canonicalVariant === 'FarkliVaryant' ||
      canonicalVariant === 'Genel Model' ||
      this.isNumericOnly(canonicalVariant) ||
      canonicalVariant.toLowerCase().includes('sahibinden') ||
      canonicalVariant.toLowerCase().includes('modelleri') ||
      canonicalVariant.toLowerCase().includes('modleri') ||
      canonicalVariant.toLowerCase().includes('farklivaryant')
    ) {
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
