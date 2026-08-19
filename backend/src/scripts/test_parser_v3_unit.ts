import { extractCanonicalVehicleMetadata } from './parser_v3_helper';

function test() {
  console.log('Testing Parser V3 Extraction Rules:\n');

  const cases = [
    {
      input: { make: 'Audi', modelCell: 'A3 A3 Sportback 1.5 TFSI', variantCell: '', title: 'Satılık Audi A3 Sportback 1.5 TFSI' },
      expected: { make: 'Audi', model: 'A3', body: 'Sportback', variant: '1.5 TFSI' }
    },
    {
      input: { make: 'Audi', modelCell: 'A3 A3 Sportback 1.0 TFSI Design Line', variantCell: '1.0 TFSI Design Line', title: 'Audi A3 Sportback' },
      expected: { make: 'Audi', model: 'A3', body: 'Sportback', variant: '1.0 TFSI', trim: 'Design Line' }
    },
    {
      input: { make: 'Alfa Romeo', modelCell: '156', variantCell: '1.6 TS Distinctive', title: 'Alfa Romeo 156 1.6 TS' },
      expected: { make: 'Alfa Romeo', model: '156', variant: '1.6 TS', trim: 'Distinctive' }
    },
    {
      input: { make: 'BMW', modelCell: '3 Serisi', variantCell: '316i M Sport', title: 'BMW 316i M Sport' },
      expected: { make: 'BMW', model: '3 Serisi', variant: '316i', trim: 'M Sport' }
    },
    {
      input: { make: 'Audi', modelCell: 'A2 1.4', variantCell: '1.4', title: 'Audi A2 1.4' },
      expected: { make: 'Audi', model: 'A2', variant: '1.4' }
    }
  ];

  for (const c of cases) {
    const res = extractCanonicalVehicleMetadata(c.input.make, c.input.modelCell, c.input.variantCell, c.input.title);
    console.log(`INPUT: Make="${c.input.make}", ModelCell="${c.input.modelCell}", VariantCell="${c.input.variantCell}"`);
    console.log(`OUTPUT: Make="${res.canonicalMake}", Model="${res.canonicalModel}", Variant="${res.canonicalVariant}", Trim="${res.canonicalTrim}", Body="${res.canonicalBodyType}"\n`);
  }
}

test();
