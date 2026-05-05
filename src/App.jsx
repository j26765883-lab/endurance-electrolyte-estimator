import { useState, useMemo, useEffect } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts';
import { calculatePhysiologyAtTime } from './math.js';

// Sweat profiles based on Lara et al. (2016)
const SWEAT_PROFILES = {
  low: { mean: 21.4, sd: 6.4, label: 'Low-Salt Sweater (21.4 ± 6.4 mmol/L)' },
  typical: { mean: 43.2, sd: 8.8, label: 'Typical Sweater (43.2 ± 8.8 mmol/L)' },
  salty: { mean: 71.0, sd: 9.0, label: 'Salty Sweater (71.0 ± 9.0 mmol/L)' },
  custom: { mean: null, sd: null, label: 'Custom Lab Result' }
};

// Helper function to pull parameters from the URL
const getParam = (key, defaultVal) => {
  const val = new URLSearchParams(window.location.search).get(key);
  return val !== null ? val : defaultVal;
};

export default function App() {
  // --- STATE: Athlete Inputs (Initialized from URL if present) ---
  const [unit, setUnit] = useState(() => getParam('u', 'lbs'));
  const [weight, setWeight] = useState(() => getParam('w', 180));
  const [duration, setDuration] = useState(() => getParam('d', 24));
  const [sweatRate, setSweatRate] = useState(() => getParam('sr', 0.8));
  const [waterIntake, setWaterIntake] = useState(() => getParam('wi', 0.8));
  const [naIntake, setNaIntake] = useState(() => getParam('ni', 500));
  
  const [profile, setProfile] = useState(() => getParam('p', 'typical'));
  const [customSweatNa, setCustomSweatNa] = useState(() => getParam('c', 1000));

  const [tbwPct, setTbwPct] = useState(() => getParam('tbw', 60)); 
  const [baselineNa, setBaselineNa] = useState(() => getParam('bna', 140)); 
  
  const [copied, setCopied] = useState(false);

  // Constants
  const hypoLimit = -2; 
  const hypoNaLimit = 135; 
  const hyperNaLimit = 145; 

  // --- URL SYNC EFFECT ---
  // Updates the browser URL silently as the user types
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('u', unit);
    if (weight !== '') params.set('w', weight);
    if (duration !== '') params.set('d', duration);
    if (sweatRate !== '') params.set('sr', sweatRate);
    if (waterIntake !== '') params.set('wi', waterIntake);
    if (naIntake !== '') params.set('ni', naIntake);
    params.set('p', profile);
    if (profile === 'custom' && customSweatNa !== '') params.set('c', customSweatNa);
    if (tbwPct !== '') params.set('tbw', tbwPct);
    if (baselineNa !== '') params.set('bna', baselineNa);

    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [unit, weight, duration, sweatRate, waterIntake, naIntake, profile, customSweatNa, tbwPct, baselineNa]);

  // --- HANDLERS ---
  const handleUnitToggle = (newUnit) => {
    if (unit === newUnit) return;
    if (newUnit === 'kg') {
      setWeight(+(Number(weight) / 2.20462).toFixed(1));
    } else {
      setWeight(+(Number(weight) * 2.20462).toFixed(1));
    }
    setUnit(newUnit);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // --- MATH LOGIC ---
  const chartData = useMemo(() => {
    const data = [];
    
    // Safely parse state to handle empty strings while typing
    const nWeight = Number(weight) || 0;
    const nDuration = Number(duration) || 0;
    const nSweatRate = Number(sweatRate) || 0;
    const nWaterIntake = Number(waterIntake) || 0;
    const nNaIntake = Number(naIntake) || 0;
    const nTbwPct = Number(tbwPct) || 0;
    const nBaselineNa = Number(baselineNa) || 0;
    const nCustomSweatNa = Number(customSweatNa) || 0;

    // Convert weight to lbs for the math engine if it's currently in kg
    const weightLbs = unit === 'kg' ? nWeight * 2.20462 : nWeight;
    const baseParams = { weightLbs, sweatRate: nSweatRate, waterIntake: nWaterIntake, naIntake: nNaIntake, tbwPct: nTbwPct, baselineNa: nBaselineNa };

    for (let t = 0; t <= nDuration; t += 0.5) {
      if (profile === 'custom') {
        const result = calculatePhysiologyAtTime({ ...baseParams, sweatNa: nCustomSweatNa }, t);
        data.push({ 
          ...result, 
          sodiumRange1SD: [result.serumNa, result.serumNa],
          sodiumRange2SD: [result.serumNa, result.serumNa]
        });
      } else {
        const meanMg = SWEAT_PROFILES[profile].mean * 23;
        const sdMg = SWEAT_PROFILES[profile].sd * 23;

        const meanResult = calculatePhysiologyAtTime({ ...baseParams, sweatNa: meanMg }, t);
        
        const sd1HighLoss = calculatePhysiologyAtTime({ ...baseParams, sweatNa: meanMg + sdMg }, t).serumNa;
        const sd1LowLoss = calculatePhysiologyAtTime({ ...baseParams, sweatNa: meanMg - sdMg }, t).serumNa;

        const sd2HighLoss = calculatePhysiologyAtTime({ ...baseParams, sweatNa: meanMg + (sdMg * 2) }, t).serumNa;
        const sd2LowLoss = calculatePhysiologyAtTime({ ...baseParams, sweatNa: meanMg - (sdMg * 2) }, t).serumNa;

        data.push({
          time: t,
          weightChange: meanResult.weightChange,
          serumNa: meanResult.serumNa,
          sodiumRange1SD: [
            Math.min(sd1HighLoss, sd1LowLoss),
            Math.max(sd1HighLoss, sd1LowLoss)
          ],
          sodiumRange2SD: [
            Math.min(sd2HighLoss, sd2LowLoss),
            Math.max(sd2HighLoss, sd2LowLoss)
          ]
        });
      }
    }
    return data;
  }, [weight, unit, duration, sweatRate, waterIntake, naIntake, tbwPct, baselineNa, profile, customSweatNa]);

  const xTicks = useMemo(() => {
    const nDuration = Number(duration) || 0;
    let step = 0.5;
    if (nDuration >= 24) step = 6;
    else if (nDuration >= 16) step = 4;
    else if (nDuration >= 8) step = 2;
    else if (nDuration > 4) step = 1;

    const ticks = [];
    for (let i = 0; i <= nDuration; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== nDuration) ticks.push(nDuration);
    return ticks;
  }, [duration]);

  const finalData = chartData[chartData.length - 1];
  const nWeight = Number(weight) || 0;
  const finalAbsoluteWeight = finalData ? ((finalData.weightChange / 100) * nWeight).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-slate-800 flex flex-col">
      <div className="max-w-6xl mx-auto space-y-6 flex-grow w-full">
        
        <header className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Endurance Electrolyte Estimator</h1>
          <p className="text-slate-600 mt-2 mb-4">Model your hydration and sodium trends using normative athlete data.</p>
          
          <button 
            onClick={handleCopyLink} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-full shadow-sm border border-slate-200 transition-colors"
          >
            {copied ? (
              <span className="text-emerald-600 font-bold">✓ Link Copied!</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Share / Bookmark Plan
              </>
            )}
          </button>
        </header>

        {/* INSTRUCTIONS & DISCLAIMER */}
        <div className="space-y-4 mb-8">
          <div className="bg-amber-50 text-amber-900 p-4 rounded-lg text-sm border border-amber-200 shadow-sm">
            <strong>Medical Disclaimer:</strong> This application is for informational and educational purposes only. It uses mathematical mass-balance models to estimate physiological trends and is not intended to provide medical advice, diagnose, treat, cure, or prevent any condition. Always consult with a qualified healthcare professional or sports dietician before making changes to your hydration or nutrition strategies.
          </div>
          
          <div className="bg-blue-50 text-blue-900 p-4 rounded-lg text-sm border border-blue-200 shadow-sm">
            <h3 className="font-bold mb-2">How to use this tool:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Step 1:</strong> Enter your starting weight and the expected duration of your event.</li>
              <li><strong>Step 2:</strong> Estimate your average hourly sweat rate and fluid intake.</li>
              <li><strong>Step 3:</strong> Select a sweat sodium profile. If you have not been lab-tested, use the guide below the dropdown to estimate your profile.</li>
              <li><strong>Step 4:</strong> Adjust your hourly sodium intake to observe how it affects your estimated serum sodium levels, aiming to keep the trend safely between the hyponatremia and hypernatremia limits.</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* LEFT COLUMN: INPUTS */}
          <div className="col-span-1 md:col-span-5 space-y-6">
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
              <h2 className="font-semibold text-lg border-b pb-2">Race Parameters</h2>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium">Starting Weight</label>
                    <div className="flex bg-slate-100 rounded border border-slate-200 p-0.5">
                      <button 
                        onClick={() => handleUnitToggle('lbs')} 
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${unit === 'lbs' ? 'bg-white shadow-sm font-bold text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        lbs
                      </button>
                      <button 
                        onClick={() => handleUnitToggle('kg')} 
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${unit === 'kg' ? 'bg-white shadow-sm font-bold text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        kg
                      </button>
                    </div>
                  </div>
                  <input type="number" min="0" value={weight} onChange={e => setWeight(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 bg-slate-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (hours)</label>
                  <input type="number" min="0" step="0.5" value={duration} onChange={e => setDuration(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 bg-slate-50" />
                </div>
                <hr />
                <div>
                  <label className="block text-sm font-medium mb-1">Avg Sweat Rate (L/hr)</label>
                  <input type="number" min="0" step="0.1" value={sweatRate} onChange={e => setSweatRate(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 bg-slate-50" />
                  
                  {/* Sweat Rate Estimation Guide */}
                  <details className="mt-2 mb-4 group">
                    <summary className="text-xs font-medium text-blue-600 cursor-pointer hover:underline flex items-center outline-none">
                      How do I estimate my sweat rate?
                    </summary>
                    <div className="mt-2 p-3 bg-blue-50/50 rounded border border-blue-100 text-xs text-slate-700 space-y-2">
                      <p><strong>The 1-Hour Sweat Test:</strong></p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>Empty your bladder and weigh yourself nude before exercise.</li>
                        <li>Exercise at your race pace/intensity for exactly 1 hour. <span className="italic text-slate-500">(Try not to drink fluids or use the restroom during this hour for easiest math)</span>.</li>
                        <li>Wipe off all sweat with a towel and weigh yourself nude again.</li>
                      </ol>
                      <p><strong>Calculation:</strong> Your weight lost in kilograms roughly equals your sweat rate in Liters per hour (e.g., 1 kg lost = 1 L/hr). If using pounds, divide the pounds lost by 2.2 to get Liters per hour.</p>
                      <p className="italic text-slate-500 mt-1">Note: If you did drink fluids, you must add that fluid volume (in Liters) to your total weight lost.</p>
                    </div>
                  </details>
                </div>
                
                {/* Sweat Profile Selector */}
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <label className="block text-sm font-semibold mb-2">Sweat Sodium Profile</label>
                  <select 
                    value={profile} 
                    onChange={e => setProfile(e.target.value)}
                    className="w-full text-sm border rounded p-2 mb-2 bg-white"
                  >
                    {Object.entries(SWEAT_PROFILES).map(([key, data]) => (
                      <option key={key} value={key}>{data.label}</option>
                    ))}
                  </select>

                  {profile === 'custom' ? (
                    <div className="mt-3">
                      <label className="block text-xs font-medium mb-1">Custom Concentration (mg/L)</label>
                      <input type="number" min="0" step="50" value={customSweatNa} onChange={e => setCustomSweatNa(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 bg-white" />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      Estimating based on {(SWEAT_PROFILES[profile].mean * 23).toFixed(0)} mg/L mean concentration.
                    </p>
                  )}

                  <details className="mt-3 group">
                    <summary className="text-xs font-medium text-blue-600 cursor-pointer hover:underline flex items-center outline-none">
                      How do I estimate my profile?
                    </summary>
                    <div className="mt-2 p-3 bg-blue-50/50 rounded border border-blue-100 text-xs text-slate-700 space-y-2">
                      <p className="italic text-slate-500 pb-1 border-b border-blue-100/50">The most accurate way to determine your sweat sodium concentration is through an official lab test. However, if you haven't been tested, here are some common signs to help you estimate:</p>
                      <p><strong>Low-Salt:</strong> Sweat tastes watery. You rarely find white salt stains on your clothes or hats, even on hot days.</p>
                      <p><strong>Typical:</strong> Sweat tastes somewhat salty. You might see faint salt residue on clothes only after extremely hot or long efforts.</p>
                      <p><strong>Salty:</strong> Sweat tastes like seawater and stings your eyes. You consistently find gritty, white salt rings on your clothes or helmet straps, and intensely crave salty foods post-race.</p>
                    </div>
                  </details>
                </div>

                <hr />
                <div>
                  <label className="block text-sm font-medium mb-1">Avg Fluid Intake (L/hr)</label>
                  <input type="number" min="0" step="0.1" value={waterIntake} onChange={e => setWaterIntake(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 bg-slate-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Avg Sodium Intake (mg/hr)</label>
                  <input type="number" min="0" step="50" value={naIntake} onChange={e => setNaIntake(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 bg-slate-50" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <details className="group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between border-b pb-2">
                  Advanced Assumptions
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Total Body Water (%)</label>
                    <input type="number" min="0" max="100" value={tbwPct} onChange={e => setTbwPct(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 text-sm bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Baseline Serum Na (mmol/L)</label>
                    <input type="number" min="0" value={baselineNa} onChange={e => setBaselineNa(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded p-2 text-sm bg-slate-50" />
                  </div>
                </div>
              </details>
            </div>

          </div>

          {/* RIGHT COLUMN: CHARTS */}
          <div className="col-span-1 md:col-span-7 space-y-6">
            
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl shadow-sm border ${finalData?.weightChange <= hypoLimit ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                <p className="text-sm text-slate-500">Final Weight Change</p>
                <p className={`text-2xl font-bold ${finalData?.weightChange <= hypoLimit ? 'text-red-600' : 'text-slate-800'}`}>
                  {finalData?.weightChange}% <span className="text-lg font-medium opacity-60 ml-1">({finalAbsoluteWeight > 0 ? '+' : ''}{finalAbsoluteWeight} {unit})</span>
                </p>
              </div>
              <div className={`p-4 rounded-xl shadow-sm border ${finalData?.serumNa <= hypoNaLimit || finalData?.serumNa >= hyperNaLimit ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
                <p className="text-sm text-slate-500">
                  {profile === 'custom' ? 'Final Serum Sodium' : 'Estimated Final Mean'}
                </p>
                <p className={`text-2xl font-bold ${finalData?.serumNa <= hypoNaLimit || finalData?.serumNa >= hyperNaLimit ? 'text-orange-600' : 'text-slate-800'}`}>
                  {finalData?.serumNa} mmol/L
                </p>
                {profile !== 'custom' && (
                  <p className="text-xs text-slate-500 mt-1">
                    95% Range: {finalData?.sodiumRange2SD[0].toFixed(1)} - {finalData?.sodiumRange2SD[1].toFixed(1)}
                  </p>
                )}
              </div>
            </div>

            {/* Hydration Chart */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-72">
              <h3 className="text-sm font-semibold mb-4 text-center">Body Weight Change (%)</h3>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" type="number" ticks={xTicks} domain={[0, 'dataMax']} unit="h" />
                  {/* Dynamic bound for extreme drops, capped cleanly at 2 on the top */}
                  <YAxis domain={[(dataMin) => Math.min(-4, Math.floor(dataMin - 1)), 2]} />
                  <ReferenceLine y={hypoLimit} stroke="red" strokeDasharray="3 3" label={`Hypohydration (${hypoLimit}%)`} />
                  <Line type="monotone" dataKey="weightChange" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Sodium Chart */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-semibold mb-4 text-center">Estimated Serum Sodium (mmol/L)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" type="number" ticks={xTicks} domain={[0, 'dataMax']} unit="h" />
                    {/* Dynamic bound perfectly frames extreme highs or lows without locking onto hardcoded numbers */}
                    <YAxis domain={[(dataMin) => Math.min(125, Math.floor(dataMin - 2)), (dataMax) => Math.max(155, Math.ceil(dataMax + 2))]} />
                    <ReferenceLine y={hypoNaLimit} stroke="orange" strokeDasharray="3 3" label={`Hyponatremia (${hypoNaLimit})`} />
                    <ReferenceLine y={hyperNaLimit} stroke="orange" strokeDasharray="3 3" label={`Hypernatremia (${hyperNaLimit})`} />
                    
                    {profile !== 'custom' && (
                      <>
                        <Area type="monotone" dataKey="sodiumRange2SD" fill="#10b981" fillOpacity={0.15} stroke="none" activeDot={false} />
                        <Area type="monotone" dataKey="sodiumRange1SD" fill="#10b981" fillOpacity={0.3} stroke="none" activeDot={false} />
                      </>
                    )}
                    <Line type="monotone" dataKey="serumNa" stroke="#10b981" strokeWidth={3} dot={false} activeDot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Statistical Legend */}
              {profile !== 'custom' && (
                <div className="mt-6 text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="mb-3"><strong>Interpreting the Chart:</strong></p>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 shrink-0 flex justify-center mt-1.5">
                        <div className="h-0.5 w-8 bg-[#10b981]"></div>
                      </div>
                      <p className="text-xs">
                        The solid line shows the <strong>average (mean)</strong> expected trend for athletes matching this profile.
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 shrink-0 flex justify-center mt-0.5">
                        <div className="h-3 w-8 bg-[#10b981] opacity-30 rounded"></div>
                      </div>
                      <p className="text-xs">
                        The darker central area (±1 SD) shows the expected range for <strong>~68% of athletes</strong> matching this profile.
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 shrink-0 flex justify-center mt-0.5">
                        <div className="h-3 w-8 bg-[#10b981] opacity-15 rounded"></div>
                      </div>
                      <p className="text-xs">
                        The wider, lighter area (±2 SD) captures the extreme variations, encompassing <strong>~95% of athletes</strong> in this profile.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* EDUCATIONAL RESOURCES SECTION */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-8">
          <h2 className="font-semibold text-lg border-b pb-2 mb-4">Understanding the Conditions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-red-50/50 p-4 rounded-lg border border-red-100">
              <h3 className="font-bold text-red-700 mb-2">Hypohydration (Dehydration)</h3>
              <p className="text-sm text-slate-700 mb-2">Occurs when you lose more fluid through sweat than you take in, leading to a water deficit in the body.</p>
              <p className="text-xs text-slate-600 mb-3"><strong>Common Signs:</strong> Extreme thirst, dry mouth, dark urine, fatigue, dizziness, and decreased athletic performance.</p>
              <a href="https://www.mayoclinic.org/diseases-conditions/dehydration/symptoms-causes/syc-20354086" target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center">
                Read more on Mayo Clinic <span className="ml-1">→</span>
              </a>
            </div>
            
            <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
              <h3 className="font-bold text-orange-700 mb-2">Hyponatremia</h3>
              <p className="text-sm text-slate-700 mb-2">A potentially dangerous condition where blood sodium levels drop too low. In endurance sports, this is often caused by overdrinking fluids relative to sodium loss.</p>
              <p className="text-xs text-slate-600 mb-3"><strong>Common Signs:</strong> Nausea, headache, confusion, lethargy, muscle cramps, slurred speech, and in severe cases, seizures.</p>
              <a href="https://www.mayoclinic.org/diseases-conditions/hyponatremia/symptoms-causes/syc-20373711" target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center">
                Read more on Mayo Clinic <span className="ml-1">→</span>
              </a>
            </div>

            <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
              <h3 className="font-bold text-amber-700 mb-2">Hypernatremia</h3>
              <p className="text-sm text-slate-700 mb-2">An elevation in blood sodium levels. During exercise, this usually results from inadequate water intake relative to water loss (severe dehydration) alongside salt intake.</p>
              <p className="text-xs text-slate-600 mb-3"><strong>Common Signs:</strong> Intense thirst, lethargy, muscle twitching, confusion, and irritability.</p>
              <a href="https://my.clevelandclinic.org/health/diseases/23164-hypernatremia" target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center">
                Read more on Cleveland Clinic <span className="ml-1">→</span>
              </a>
            </div>
          </div>
        </div>

      </div>

      {/* FOOTER & CITATIONS */}
      <footer className="max-w-6xl mx-auto w-full mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 space-y-4 pb-8">
        <div>
          <strong className="block mb-2 text-slate-700">Scientific References:</strong>
          <ul className="space-y-2 pl-4 list-disc">
            <li>
              <strong>Mathematical Model:</strong> McCubbin, A. J. (2022). Modelling sodium requirements of athletes across a variety of exercise scenarios: Identifying when to test and target, or season to taste. <em>European Journal of Sport Science</em>, 23(6), 992-1000.
            </li>
            <li>
              <strong>Sweat Profiles:</strong> Lara, B., Gallo-Salazar, C., Puente, C., Areces, F., Salinero, J. J., & Del Coso, J. (2016). Interindividual variability in sweat electrolyte concentration in marathoners. <em>Journal of the International Society of Sports Nutrition</em>, 13.
            </li>
            <li>
              <strong>Normative Database:</strong> Barnes, K. A., Anderson, M. L., Stofan, J. R., Dalrymple, K. J., Reimel, A. J., Roberts, T. J., ... & Baker, L. B. (2019). Normative data for sweating rate, sweat sodium concentration, and sweat sodium loss in athletes: An update and analysis by sport. <em>Journal of Sports Sciences</em>, 37(20), 2356-2366.
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}