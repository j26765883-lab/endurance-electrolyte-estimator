// src/math.js

export function calculatePhysiologyAtTime(params, t) {
  const { weightLbs, sweatRate, sweatNa, waterIntake, naIntake, tbwPct, baselineNa } = params;
  
  const weightKg = weightLbs / 2.2046;
  const initialTBW = weightKg * (tbwPct / 100); 

  // Hydration Math
  const netWater = (waterIntake - sweatRate) * t;
  const weightChangePct = (netWater / weightKg) * 100;
  
  // Sodium Math (Paper-aligned)
  const naConsumedMmol = (naIntake * t) / 23; 
  const naLostMmol = (sweatRate * sweatNa * t) / 23; 
  const kLostMmol = sweatRate * 3.5 * t; // Paper assumes 3.5 mmol/L sweat K+
  
  const deltaE = naConsumedMmol - (naLostMmol + kLostMmol);
  const currentTBW = initialTBW + netWater;
  
  let serumNa = baselineNa;
  if (currentTBW > 0) {
    serumNa = (((baselineNa + 23.8) * initialTBW) + (1.03 * deltaE)) / currentTBW - 23.8;
  }

  return {
    time: t,
    weightChange: parseFloat(weightChangePct.toFixed(2)),
    serumNa: parseFloat(serumNa.toFixed(1))
  };
}

// Keep this wrapper so your existing Vitest tests still work perfectly!
export function calculateEndValues(params) {
  const finalState = calculatePhysiologyAtTime(params, params.duration);
  return finalState.serumNa;
}