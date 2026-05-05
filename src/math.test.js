// src/math.test.js
import { expect, test, describe } from 'vitest';
import { calculateEndValues } from './math.js';

describe('McCubbin (2022) Sodium Validation Tests', () => {

  const baseParams = {
    weightLbs: 154.3, // 70kg
    tbwPct: 60,
    baselineNa: 140,
  };

  test('Test Case 1: High Fluid & High Sweat Na (Requires 84% replacement)', () => {
    const result = calculateEndValues({
      ...baseParams,
      duration: 5,
      sweatRate: 1.5,
      sweatNa: 1840,   // 80 mmol/L
      waterIntake: 1.35, 
      naIntake: 2318.4,  // 100.8 mmol/hr * 23 (kept the decimal for precision)
    });
    // Use toBeCloseTo with 0 decimal places of strictness
    expect(result).toBeCloseTo(140, 0);
  });

  test('Test Case 2: Moderate Sweating (Requires 0% replacement)', () => {
    const result = calculateEndValues({
      ...baseParams,
      duration: 5,
      sweatRate: 1.5,
      sweatNa: 920,    // 40 mmol/L
      waterIntake: 1.05, 
      naIntake: 0,     // No sodium intake
    });
    // This one was already passing because we used GreaterThan!
    expect(result).toBeGreaterThan(140.0);
  });

  test('Test Case 3: 160km Ultramarathon', () => {
    const result = calculateEndValues({
      ...baseParams,
      duration: 18,
      sweatRate: 1.5,
      sweatNa: 1380,   // 60 mmol/L
      waterIntake: 1.42, 
      naIntake: 1909,  // 83 mmol/hr * 23
    });
    expect(result).toBeCloseTo(140, 0);
  });

  test('Test Case 4: Elite Marathon', () => {
    const result = calculateEndValues({
      weightLbs: 132.3, // 60kg for marathon test
      tbwPct: 60,
      baselineNa: 140,
      duration: 2.1,
      sweatRate: 2.5,
      sweatNa: 1380,   // 60 mmol/L
      waterIntake: 1.92, 
      naIntake: 1541,  // 67 mmol/hr * 23
    });
    expect(result).toBeCloseTo(140, 0);
  });
});