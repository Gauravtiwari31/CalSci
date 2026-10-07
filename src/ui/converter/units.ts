/** math.js unit names grouped by quantity. `name` is what math.js parses, `label` is what people read. */
export interface UnitOption {
  name: string;
  label: string;
}
export interface UnitCategory {
  id: string;
  title: string;
  units: UnitOption[];
  /** Default pair shown when the category is picked. */
  pair: [string, string];
}

const u = (name: string, label: string): UnitOption => ({ name, label });

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    title: 'Length',
    pair: ['km', 'mi'],
    units: [
      u('mm', 'Millimetre (mm)'),
      u('cm', 'Centimetre (cm)'),
      u('m', 'Metre (m)'),
      u('km', 'Kilometre (km)'),
      u('in', 'Inch (in)'),
      u('ft', 'Foot (ft)'),
      u('yd', 'Yard (yd)'),
      u('mi', 'Mile (mi)'),
      u('nmi', 'Nautical mile (nmi)'),
      u('au', 'Astronomical unit (au)'),
      u('lightyear', 'Light-year (ly)'),
    ],
  },
  {
    id: 'mass',
    title: 'Mass',
    pair: ['kg', 'lb'],
    units: [
      u('mg', 'Milligram (mg)'),
      u('g', 'Gram (g)'),
      u('kg', 'Kilogram (kg)'),
      u('tonne', 'Tonne (t)'),
      u('oz', 'Ounce (oz)'),
      u('lb', 'Pound (lb)'),
      u('stone', 'Stone (st)'),
    ],
  },
  {
    id: 'temperature',
    title: 'Temperature',
    pair: ['degC', 'degF'],
    units: [u('degC', 'Celsius (°C)'), u('degF', 'Fahrenheit (°F)'), u('K', 'Kelvin (K)')],
  },
  {
    id: 'time',
    title: 'Time',
    pair: ['h', 'min'],
    units: [
      u('ms', 'Millisecond (ms)'),
      u('s', 'Second (s)'),
      u('min', 'Minute (min)'),
      u('h', 'Hour (h)'),
      u('day', 'Day'),
      u('week', 'Week'),
      u('year', 'Year'),
    ],
  },
  {
    id: 'speed',
    title: 'Speed',
    pair: ['km/h', 'mi/h'],
    units: [
      u('m/s', 'Metres per second (m/s)'),
      u('km/h', 'Kilometres per hour (km/h)'),
      u('mi/h', 'Miles per hour (mph)'),
      u('knot', 'Knot (kn)'),
    ],
  },
  {
    id: 'area',
    title: 'Area',
    pair: ['m^2', 'ft^2'],
    units: [
      u('cm^2', 'Square centimetre (cm²)'),
      u('m^2', 'Square metre (m²)'),
      u('km^2', 'Square kilometre (km²)'),
      u('ft^2', 'Square foot (ft²)'),
      u('acre', 'Acre'),
      u('hectare', 'Hectare (ha)'),
    ],
  },
  {
    id: 'volume',
    title: 'Volume',
    pair: ['L', 'gal'],
    units: [
      u('mL', 'Millilitre (mL)'),
      u('L', 'Litre (L)'),
      u('m^3', 'Cubic metre (m³)'),
      u('cup', 'Cup'),
      u('floz', 'Fluid ounce (fl oz)'),
      u('gal', 'Gallon (US gal)'),
    ],
  },
  {
    id: 'energy',
    title: 'Energy',
    pair: ['kWh', 'J'],
    units: [
      u('J', 'Joule (J)'),
      u('kJ', 'Kilojoule (kJ)'),
      u('cal', 'Calorie (cal)'),
      u('kcal', 'Kilocalorie (kcal)'),
      u('Wh', 'Watt-hour (Wh)'),
      u('kWh', 'Kilowatt-hour (kWh)'),
      u('eV', 'Electronvolt (eV)'),
    ],
  },
  {
    id: 'power',
    title: 'Power',
    pair: ['kW', 'hp'],
    units: [
      u('W', 'Watt (W)'),
      u('kW', 'Kilowatt (kW)'),
      u('MW', 'Megawatt (MW)'),
      u('hp', 'Horsepower (hp)'),
    ],
  },
  {
    id: 'pressure',
    title: 'Pressure',
    pair: ['bar', 'psi'],
    units: [
      u('Pa', 'Pascal (Pa)'),
      u('kPa', 'Kilopascal (kPa)'),
      u('bar', 'Bar'),
      u('atm', 'Atmosphere (atm)'),
      u('psi', 'PSI'),
      u('mmHg', 'mmHg'),
    ],
  },
  {
    id: 'data',
    title: 'Data',
    pair: ['GB', 'MB'],
    units: [
      u('b', 'Bit (b)'),
      u('B', 'Byte (B)'),
      u('kB', 'Kilobyte (kB)'),
      u('MB', 'Megabyte (MB)'),
      u('GB', 'Gigabyte (GB)'),
      u('TB', 'Terabyte (TB)'),
      u('KiB', 'Kibibyte (KiB)'),
      u('MiB', 'Mebibyte (MiB)'),
      u('GiB', 'Gibibyte (GiB)'),
    ],
  },
  {
    id: 'angle',
    title: 'Angle',
    pair: ['deg', 'rad'],
    units: [u('deg', 'Degree (°)'), u('rad', 'Radian (rad)'), u('grad', 'Gradian (grad)')],
  },
];

/** `km/h` → `{\mathrm{km}}/{\mathrm{h}}`. Braces stop MathLive from merging typed digits into the unit. */
export function unitLatex(name: string): string {
  return name
    .split('/')
    .map((part) => {
      const [base, pow] = part.split('^');
      return `{\\mathrm{${base}}}${pow ? `^{${pow}}` : ''}`;
    })
    .join('/');
}

/** Short symbol for display: the bit in brackets, or the name itself. */
export function unitSymbol(cat: UnitCategory | undefined, name: string): string {
  const label = cat?.units.find((x) => x.name === name)?.label;
  return label?.match(/\(([^)]+)\)$/)?.[1] ?? name;
}
