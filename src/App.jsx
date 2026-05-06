import { useState, useMemo, useEffect } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceArea, ResponsiveContainer } from 'recharts';
import { calculatePhysiologyAtTime } from './math.js';
import { getParam } from './utils.js';

// Sweat profiles based on Lara et al. (2016)
const SWEAT_PROFILES = {
  low: { mean: 21.4, sd: 6.4, label: 'Low-Salt Sweater (21.4 ± 6.4 mmol/L)' },
  typical: { mean: 43.2, sd: 8.8, label: 'Typical Sweater (43.2 ± 8.8 mmol/L)' },
  salty: { mean: 71.0, sd: 9.0, label: 'Salty Sweater (71.0 ± 9.0 mmol/L)' },
  custom: { mean: null, sd: null, label: 'Custom Lab Result' }
};

export default function App() {
  // --- STATE: Athlete Inputs (Initialized from URL if present) ---
  const [unit, setUnit] = useState(() => getParam(window.location.search, 'u', 'lbs'));
  const [weight, setWeight] = useState(() => getParam(window.location.search, 'w', 180));
  const [duration, setDuration] = useState(() => getParam(window.location.search, 'd', 24));
  const [sweatRate, setSweatRate] = useState(() => getParam(window.location.search, 'sr', 0.8));
  const [waterIntake, setWaterIntake] = useState(() => getParam(window.location.search, 'wi', 0.8));
  const [naIntake, setNaIntake] = useState(() => getParam(window.location.search, 'ni', 500));
  
  const [profile, setProfile] = useState(() => getParam(window.location.search, 'p', 'typical'));
  const [customSweatNa, setCustomSweatNa] = useState(() => getParam(window.location.search, 'c', 1000));

  const [tbwPct, setTbwPct] = useState(() => getParam(window.location.search, 'tbw', 60)); 
  const [baselineNa, setBaselineNa] = useState(() => getParam(window.location.search, 'bna', 140)); 
  
  const [copied, setCopied] = useState(false);

  // Constants for thresholds
  const hypoLimit = -2; 
  const hypoNaLimit = 135; 
  const hyperNaLimit = 145; 

  // --- URL SYNC EFFECT ---
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
    
    const nWeight = Number(weight) || 0;
    const nDuration = Number(duration) || 0;
    const nSweatRate = Number(sweatRate) || 0;
    const nWaterIntake = Number(waterIntake) || 0;
    const nNaIntake = Number(naIntake) || 0;
    const nTbwPct = Number(tbwPct) || 0;
    const nBaselineNa = Number(baselineNa) || 0;
    const nCustomSweatNa = Number(customSweatNa) || 0;

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

  const { hydYMin, sodYMin, sodYMax } = useMemo(() => {
    if (!chartData || chartData.length === 0) return { hydYMin: -8, sodYMin: 120, sodYMax: 160 };
    
    const minWeight = Math.min(...chartData.map(d => d.weightChange));
    const minSod = Math.min(...chartData.map(d => d.sodiumRange2SD ? d.sodiumRange2SD[0] : d.serumNa));
    const maxSod = Math.max(...chartData.map(d => d.sodiumRange2SD ? d.sodiumRange2SD[1] : d.serumNa));
    
    return {
      hydYMin: Math.min(-8, Math.floor(minWeight - 1)),
      hydYMax: Math.max(2, Math.ceil(maxWeight + 1)),
      sodYMin: Math.min(120, Math.floor(minSod - 2)),
      sodYMax: Math.max(160, Math.ceil(maxSod + 2))
    };
  }, [chartData]);

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
          <p className="text-slate-600 mt-2 max-w-3xl mx-auto leading-relaxed">
            This tool uses mathematical mass-balance models to help athletes visualize how their body weight and serum sodium levels might change during endurance events based on their individual parameters (sweat rate, fluid intake, sodium intake).
          </p>
          
          <div className="flex flex-wrap justify-center items-center gap-3 mt-5">
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
            <a 
              href="https://github.com/j26765883-lab/endurance-electrolyte-estimator" 
              target="_blank" 
              rel="noreferrer" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-full shadow-sm transition-colors"
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"></path>
              </svg>
              View on GitHub
            </a>
          </div>
        </header>

        {/* INSTRUCTIONS & DISCLAIMER */}
        <div className="space-y-4 mb-8">
          <div className="bg-amber-50 text-amber-900 p-4 rounded-lg text-sm border border-amber-200 shadow-sm leading-relaxed">
            <strong>Medical Disclaimer:</strong> This application is for informational and educational purposes only. It uses mathematical mass-balance models to estimate physiological trends and is not intended to provide medical advice, diagnose, treat, cure, or prevent any condition. Always consult with a qualified healthcare professional or sports dietician before making changes to your hydration or nutrition strategies.
          </div>
          
          <div className="bg-blue-50 text-blue-900 p-4 rounded-lg text-sm border border-blue-200 shadow-sm">
            <h3 className="font-bold mb-2">How to use this tool:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Step 1:</strong> Enter your starting weight and the expected duration of your event.</li>
              <li><strong>Step 2:</strong> Estimate your average hourly sweat rate and fluid intake.</li>
              <li><strong>Step 3:</strong> Select a sweat sodium profile. If you have not been lab-tested, use the guide below the dropdown to estimate your profile.</li>
              <li><strong>Step 4:</strong> Adjust your hourly sodium intake to observe how it affects your estimated serum sodium levels, aiming to keep the trend safely out of the red and orange zones.</li>
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
                  {/* Color Zones with increased opacity and strokes */}
                  <ReferenceArea y1={-2} y2={-4} fill="#eab308" fillOpacity={0.25} stroke="#ca8a04" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideTopLeft', value: 'Mild Hypohydration', fill: '#a16207', fontSize: 11, fontWeight: 'bold' }} />
                  <ReferenceArea y1={-4} y2={-6} fill="#f97316" fillOpacity={0.25} stroke="#ea580c" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideTopLeft', value: 'Moderate Hypohydration', fill: '#c2410c', fontSize: 11, fontWeight: 'bold' }} />
                  <ReferenceArea y1={-6} y2={hydYMin} fill="#ef4444" fillOpacity={0.25} stroke="#dc2626" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideTopLeft', value: 'Severe Hypohydration', fill: '#b91c1c', fontSize: 11, fontWeight: 'bold' }} />
                  
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" type="number" ticks={xTicks} domain={[0, 'dataMax']} unit="h" />
                  <YAxis domain={[hydYMin, hydYMax]} />
                  
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
                    {/* Fixed Hyponatremia Zones */}
                    <ReferenceArea y1={130} y2={135} fill="#eab308" fillOpacity={0.25} stroke="#ca8a04" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideTopLeft', value: 'Mild Hyponatremia', fill: '#a16207', fontSize: 11, fontWeight: 'bold' }} />
                    <ReferenceArea y1={125} y2={130} fill="#f97316" fillOpacity={0.25} stroke="#ea580c" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideTopLeft', value: 'Moderate Hyponatremia', fill: '#c2410c', fontSize: 11, fontWeight: 'bold' }} />
                    <ReferenceArea y1={sodYMin} y2={125} fill="#ef4444" fillOpacity={0.25} stroke="#dc2626" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideTopLeft', value: 'Severe Hyponatremia', fill: '#b91c1c', fontSize: 11, fontWeight: 'bold' }} />
                    
                    {/* Fixed Hypernatremia Zones */}
                    <ReferenceArea y1={145} y2={150} fill="#eab308" fillOpacity={0.25} stroke="#ca8a04" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideBottomLeft', value: 'Mild Hypernatremia', fill: '#a16207', fontSize: 11, fontWeight: 'bold' }} />
                    <ReferenceArea y1={150} y2={155} fill="#f97316" fillOpacity={0.25} stroke="#ea580c" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideBottomLeft', value: 'Moderate Hypernatremia', fill: '#c2410c', fontSize: 11, fontWeight: 'bold' }} />
                    <ReferenceArea y1={155} y2={sodYMax} fill="#ef4444" fillOpacity={0.25} stroke="#dc2626" strokeOpacity={0.5} strokeWidth={1} label={{ position: 'insideBottomLeft', value: 'Severe Hypernatremia', fill: '#b91c1c', fontSize: 11, fontWeight: 'bold' }} />
                    
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" type="number" ticks={xTicks} domain={[0, 'dataMax']} unit="h" />
                    <YAxis domain={[sodYMin, sodYMax]} />
                    
                    {profile !== 'custom' && (
                      <>
                        {/* 95% Range: Light Blue */}
                        <Area type="monotone" dataKey="sodiumRange2SD" fill="#93c5fd" fillOpacity={0.4} stroke="none" activeDot={false} />
                        {/* 68% Range: Medium Blue */}
                        <Area type="monotone" dataKey="sodiumRange1SD" fill="#3b82f6" fillOpacity={0.5} stroke="none" activeDot={false} />
                      </>
                    )}
                    {/* Mean Line: Dark Indigo/Blue */}
                    <Line type="monotone" dataKey="serumNa" stroke="#1d4ed8" strokeWidth={3} dot={false} activeDot={false} />
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
                        <div className="h-0.5 w-8 bg-[#1d4ed8]"></div>
                      </div>
                      <p className="text-xs">
                        The solid line shows the <strong>average (mean)</strong> expected trend for athletes matching this profile.
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 shrink-0 flex justify-center mt-0.5">
                        <div className="h-3 w-8 bg-[#3b82f6] opacity-50 rounded"></div>
                      </div>
                      <p className="text-xs">
                        The darker central area (±1 SD) shows the expected range for <strong>~68% of athletes</strong> matching this profile.
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 shrink-0 flex justify-center mt-0.5">
                        <div className="h-3 w-8 bg-[#93c5fd] opacity-40 rounded"></div>
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
          <strong className="block mb-2 text-slate-700">Scientific References & Guidelines:</strong>
          <ul className="space-y-2 pl-4 list-disc mt-2">
            <li>
              <strong>Mathematical Model:</strong> McCubbin, A. J. (2022). Modelling sodium requirements of athletes across a variety of exercise scenarios: Identifying when to test and target, or season to taste. <em>European Journal of Sport Science</em>, 23(6), 992-1000.
            </li>
            <li>
              <strong>Sweat Profiles:</strong> Lara, B., Gallo-Salazar, C., Puente, C., Areces, F., Salinero, J. J., & Del Coso, J. (2016). Interindividual variability in sweat electrolyte concentration in marathoners. <em>Journal of the International Society of Sports Nutrition</em>, 13.
            </li>
            <li>
              <strong>Normative Database:</strong> Barnes, K. A., Anderson, M. L., Stofan, J. R., Dalrymple, K. J., Reimel, A. J., Roberts, T. J., ... & Baker, L. B. (2019). Normative data for sweating rate, sweat sodium concentration, and sweat sodium loss in athletes: An update and analysis by sport. <em>Journal of Sports Sciences</em>, 37(20), 2356-2366.
            </li>
            <li>
              <strong>ACSM Guidelines:</strong> American College of Sports Medicine. (2007). Exercise and fluid replacement position stand. <em>Medicine & Science in Sports & Exercise</em>, 39(2), 377-390.
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}