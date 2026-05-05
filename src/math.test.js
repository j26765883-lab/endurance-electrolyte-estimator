// src/math.test.js
import { expect, test, it, describe } from 'vitest';
import { calculateEndValues, calculatePhysiologyAtTime } from './math.js';

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

describe('calculatePhysiologyAtTime', () => {
  const standardParams = {
    weightLbs: 150,
    sweatRate: 1.0,      
    waterIntake: 0.5,    
    naIntake: 500,       
    tbwPct: 60,          
    baselineNa: 140,     
    sweatNa: 1000        
  };

  describe('Baseline & Time Zero', () => {
    it('returns exact baseline values at time t=0', () => {
      const result = calculatePhysiologyAtTime(standardParams, 0);
      expect(result.weightChange).toBe(0); 
      expect(result.serumNa).toBeCloseTo(140, 1); 
    });
  });

  describe('Hydration & Weight Trends', () => {
    it('shows negative weight change when sweat > intake', () => {
      const result = calculatePhysiologyAtTime(standardParams, 2);
      expect(result.weightChange).toBeLessThan(0);
    });

    it('shows positive weight change when intake > sweat', () => {
      const overdrinkParams = { ...standardParams, waterIntake: 1.5 };
      const result = calculatePhysiologyAtTime(overdrinkParams, 2);
      expect(result.weightChange).toBeGreaterThan(0);
    });
  });

  describe('Sodium Trends (Hyponatremia & Hypernatremia)', () => {
    it('drops serum sodium significantly during extreme overdrinking (Hyponatremia)', () => {
      const hyponatremiaParams = { 
        ...standardParams, 
        waterIntake: 2.0, 
        sweatRate: 0.5,   
        naIntake: 0       
      };
      const result = calculatePhysiologyAtTime(hyponatremiaParams, 4); 
      expect(result.serumNa).toBeLessThan(135); 
    });

    it('raises serum sodium during severe dehydration without water (Hypernatremia)', () => {
      const hypernatremiaParams = {
        ...standardParams,
        waterIntake: 0,    
        sweatRate: 1.5,    
        naIntake: 1500     
      };
      const result = calculatePhysiologyAtTime(hypernatremiaParams, 3); 
      expect(result.serumNa).toBeGreaterThan(140);
    });
  });

  describe('Edge Cases & Safeguards', () => {
    it('handles zero body weight without crashing', () => {
      const zeroWeightParams = { ...standardParams, weightLbs: 0 };
      const result = calculatePhysiologyAtTime(zeroWeightParams, 2);
      expect(result).toHaveProperty('weightChange');
      expect(result).toHaveProperty('serumNa');
    });

    it('handles zero duration without crashing', () => {
      const result = calculatePhysiologyAtTime(standardParams, 0);
      expect(typeof result.weightChange).toBe('number');
      expect(typeof result.serumNa).toBe('number');
    });

    it('handles negative inputs without throwing fatal errors', () => {
      const negativeParams = { ...standardParams, weightLbs: -150, waterIntake: -2 };
      const result = calculatePhysiologyAtTime(negativeParams, -2);
      expect(typeof result.weightChange).toBe('number');
      expect(typeof result.serumNa).toBe('number');
    });

    it('handles physically impossible extreme values (e.g., drinking 50L/hr)', () => {
      const extremeParams = { ...standardParams, waterIntake: 50, sweatRate: 50 };
      const result = calculatePhysiologyAtTime(extremeParams, 2);
      expect(typeof result.weightChange).toBe('number');
      expect(typeof result.serumNa).toBe('number');
    });

    it('gracefully yields NaN for missing/NaN parameters instead of throwing exceptions', () => {
      const nanParams = { ...standardParams, weightLbs: NaN };
      const result = calculatePhysiologyAtTime(nanParams, 2);
      
      // Cleaned up syntax: Vitest has a specific matcher for NaN!
      expect(result.weightChange).toBeNaN();
      expect(result.serumNa).toBeNaN();
    });
  });
});