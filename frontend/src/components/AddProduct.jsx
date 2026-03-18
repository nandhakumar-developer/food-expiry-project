import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, X, Calendar, Tag, MapPin, FileText, Package,
  Leaf, Wine, Snowflake, AlertCircle, CheckCircle, Loader,
  ChevronRight, Sparkles, RotateCcw, Trash2, Plus,
  Home, Refrigerator, Apple, Beef, Milk, Sandwich,
  ScanLine, Wand2, Zap,
} from 'lucide-react';

// ── Load Puter.js from CDN (free AI vision — no API key, no backend, no cost) ─
// Puter uses "User-Pays" model: users authenticate with their free Puter account
// Developer pays nothing. Works directly in the browser.
function loadPuter() {
  return new Promise((resolve, reject) => {
    if (window.puter) { resolve(window.puter); return; }
    const s = document.createElement('script');
    s.src = 'https://js.puter.com/v2/';
    s.onload = () => {
      // puter.js attaches itself to window.puter after load
      const wait = (n) => {
        if (window.puter) resolve(window.puter);
        else if (n <= 0) reject(new Error('puter.js failed to initialise'));
        else setTimeout(() => wait(n - 1), 100);
      };
      wait(30); // wait up to 3 seconds
    };
    s.onerror = () => reject(new Error('Failed to load puter.js script'));
    document.head.appendChild(s);
  });
}

// ── Send base64 image to Puter AI (gpt-4o vision) and extract expiry date ────
async function analyseWithPuter(dataUrl) {
  const puter = await loadPuter();

  // Puter's ai.chat accepts an image URL or a data URL directly as second arg
  // We use gpt-4o which has excellent vision / OCR ability
  const prompt = `You are reading a food product label. Find the expiry date, best before date, or use by date.

IMPORTANT: Reply with ONLY a raw JSON object — no markdown, no explanation, no code fences.

If you find a date:
{"found": true, "date": "YYYY-MM-DD", "display": "exact text from label", "confidence": "high|medium|low"}

If no date visible:
{"found": false}

Rules:
- "JUL 2026" or "07/2026" → last day of month → "2026-07-31"
- "NOV 2025" → "2025-11-30"
- "31/07/2026" or "31-07-2026" → "2026-07-31"
- "12/25" → "2025-12-31"
- Look for labels: Use By, Best Before, Expiry, Exp, BB, BBE, Use Before, Best By, Mfg+shelf life`;

  const response = await puter.ai.chat(prompt, dataUrl, {
    model: 'gpt-4o',
  });

  // Response can be a string or object depending on puter version
  const raw = (typeof response === 'string' ? response : response?.message?.content || response?.toString() || '').trim();
  console.log('[Puter AI] raw response:', raw);

  const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const result = JSON.parse(clean);
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────
function AddProduct() {
  const [formData, setFormData] = useState({
    name: '', category: '', expiryDate: '', location: '', notes: '',
  });
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState({ type: '', text: '' });

  // Camera / AI state
  const [showCamera, setShowCamera]       = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiStatus, setAiStatus]           = useState(''); // status text during loading
  const [scanResult, setScanResult]       = useState(null);
  const [activeStep, setActiveStep]       = useState(1);

  const webcamRef = useRef(null);
  const navigate  = useNavigate();

  // Pre-load puter.js in background so it's ready when user clicks Scan
  useEffect(() => {
    loadPuter().catch(() => {}); // silent pre-load
  }, []);

  const categories = [
    { id:'dairy',      label:'Dairy',      icon:Milk,      bgColor:'bg-blue-50',    textColor:'text-blue-600'    },
    { id:'vegetables', label:'Vegetables', icon:Leaf,      bgColor:'bg-emerald-50', textColor:'text-emerald-600' },
    { id:'fruits',     label:'Fruits',     icon:Apple,     bgColor:'bg-green-50',   textColor:'text-green-600'   },
    { id:'meat',       label:'Meat',       icon:Beef,      bgColor:'bg-rose-50',    textColor:'text-rose-600'    },
    { id:'grains',     label:'Grains',     icon:Package,   bgColor:'bg-amber-50',   textColor:'text-amber-600'   },
    { id:'beverages',  label:'Beverages',  icon:Wine,      bgColor:'bg-purple-50',  textColor:'text-purple-600'  },
    { id:'snacks',     label:'Snacks',     icon:Sandwich,  bgColor:'bg-orange-50',  textColor:'text-orange-600'  },
    { id:'frozen',     label:'Frozen',     icon:Snowflake, bgColor:'bg-cyan-50',    textColor:'text-cyan-600'    },
    { id:'other',      label:'Other',      icon:Package,   bgColor:'bg-gray-50',    textColor:'text-gray-600'    },
  ];

  const locations = [
    { id:'pantry',       label:'Pantry',       icon:Home,         color:'amber' },
    { id:'refrigerator', label:'Refrigerator', icon:Refrigerator, color:'blue'  },
    { id:'freezer',      label:'Freezer',      icon:Snowflake,    color:'cyan'  },
    { id:'cabinet',      label:'Cabinet',      icon:Package,      color:'gray'  },
    { id:'other',        label:'Other',        icon:MapPin,       color:'gray'  },
  ];

  // ── camera ─────────────────────────────────────────────────────────────────
  const openCamera = () => {
    setCapturedImage(null); setScanResult(null);
    setMessage({ type:'', text:'' }); setShowCamera(true); setActiveStep(1);
  };

  const capture = useCallback(() => {
    const img = webcamRef.current.getScreenshot({ width:1280, height:720 });
    setCapturedImage(img); setShowCamera(false); setActiveStep(2);
  }, [webcamRef]);

  const retake  = () => { setCapturedImage(null); setScanResult(null); setShowCamera(true); setActiveStep(1); };
  const discard = () => { setCapturedImage(null); setScanResult(null); setActiveStep(1); };

  // ── AI analysis via Puter ──────────────────────────────────────────────────
  const analyseImage = async () => {
    if (!capturedImage) return;
    setAiLoading(true);
    setScanResult(null);
    setMessage({ type:'', text:'' });
    setAiStatus('Loading AI…');

    try {
      setAiStatus('Connecting to Puter AI…');
      const result = await analyseWithPuter(capturedImage);
      console.log('[Puter AI] parsed result:', result);

      setScanResult(result);

      if (result.found && result.date) {
        setFormData(prev => ({ ...prev, expiryDate: result.date }));
        const dt = new Date(result.date + 'T00:00:00');
        const display = dt.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
        setMessage({ type:'success', text:`✅ Expiry date found: ${result.display || display} — auto-filled below.` });
      } else {
        setMessage({ type:'info', text:'No expiry date detected. Please enter it manually below, or retake a clearer photo.' });
      }
      setActiveStep(3);
    } catch (err) {
      console.error('[Puter AI] error:', err);
      // If puter requires sign-in, it will throw — show helpful message
      let errText = 'AI analysis failed. Please enter the date manually.';
      if (err.message?.includes('puter') || err.message?.includes('auth') || err.message?.includes('sign')) {
        errText = 'Puter AI requires a free sign-in. A login popup may appear — sign in once and try again.';
      } else if (err.message?.includes('Failed to load')) {
        errText = 'Could not load Puter AI (check internet connection). Enter the date manually.';
      } else if (err.message) {
        errText = `AI error: ${err.message}`;
      }
      setMessage({ type:'error', text: errText });
      setActiveStep(3);
    } finally {
      setAiLoading(false);
      setAiStatus('');
    }
  };

  // ── form ───────────────────────────────────────────────────────────────────
  const handleChange = e => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.name) { setMessage({ type:'error', text:'Product name is required.' }); return; }
    setLoading(true); setMessage({ type:'', text:'' });
    try {
      await axios.post('/api/products', formData);
      setMessage({ type:'success', text:'Product added successfully!' });
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      setMessage({ type:'error', text:'Error: ' + (err.response?.data?.message || 'Unknown error') });
    } finally { setLoading(false); }
  };

  const confidenceColor = c =>
    c === 'high'   ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    c === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                     'bg-gray-100 text-gray-600 border-gray-200';

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl shadow-lg shadow-emerald-500/20">
            <Package className="text-white" size={24}/>
          </div>
          Add New Product
        </h1>
        <p className="text-gray-500 mt-2 ml-14 flex items-center gap-2">
          Scan the expiry date — AI reads it automatically
          <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full border border-emerald-200">
            <Zap size={10}/> Powered by Puter AI · Free
          </span>
        </p>
      </motion.div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1,2,3].map(step => (
            <div key={step} className="flex items-center flex-1">
              <motion.div
                animate={{
                  scale: activeStep >= step ? 1 : 0.85,
                  backgroundColor: activeStep > step ? '#10b981' : activeStep === step ? '#059669' : '#e5e7eb',
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shadow-sm"
              >
                {activeStep > step ? <CheckCircle size={20}/> : <span>{step}</span>}
              </motion.div>
              {step < 3 && (
                <div className="flex-1 h-1 mx-2 bg-gray-200 rounded overflow-hidden">
                  <motion.div
                    animate={{ width: activeStep > step ? '100%' : '0%' }}
                    transition={{ duration:0.4 }}
                    className="h-full bg-emerald-500 rounded"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-500 px-1">
          <span>Capture</span><span>AI Scan</span><span>Details</span>
        </div>
      </div>

      {/* Message Alert */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}
            className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${
              message.type==='success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              message.type==='error'   ? 'bg-rose-50 border-rose-200 text-rose-700' :
                                         'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {message.type==='success' ? <CheckCircle size={20} className="shrink-0 mt-0.5"/> :
             message.type==='error'   ? <AlertCircle size={20} className="shrink-0 mt-0.5"/> :
                                        <Sparkles   size={20} className="shrink-0 mt-0.5"/>}
            <p className="text-sm">{message.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI Scanner Card ── */}
      <motion.div
        initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6"
      >
        <div className="p-6">
          {/* Card header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Wand2 className="text-emerald-600" size={20}/>
                AI Expiry Scanner
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Uses Puter.js · free GPT-4o vision · no API key needed
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full">
              <Zap size={11}/> FREE
            </span>
          </div>

          {/* Idle */}
          {!showCamera && !capturedImage && (
            <motion.div
              whileHover={{ scale:1.01 }} onClick={openCamera}
              className="border-2 border-dashed border-gray-200 hover:border-emerald-300 rounded-xl p-10 text-center cursor-pointer transition-colors group"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100 group-hover:from-emerald-100 group-hover:to-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors shadow-inner">
                <ScanLine className="text-emerald-500" size={36}/>
              </div>
              <h3 className="font-semibold text-gray-800 mb-1">Scan Expiry Date</h3>
              <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
                Take a photo of the expiry / best before date — AI reads and fills it automatically
              </p>
              <button type="button"
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors inline-flex items-center gap-2 shadow-sm">
                <Camera size={16}/> Open Camera
              </button>
            </motion.div>
          )}

          {/* Live camera */}
          {showCamera && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-gray-900">
                <Webcam
                  audio={false} ref={webcamRef}
                  screenshotFormat="image/jpeg" screenshotQuality={0.95}
                  videoConstraints={{ width:1280, height:720, facingMode:'environment' }}
                  className="w-full h-auto"
                />
                {/* Guide frame */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-72 h-28">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"/>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"/>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"/>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"/>
                    <motion.div
                      animate={{ top:['8%','82%','8%'] }}
                      transition={{ duration:2, repeat:Infinity, ease:'easeInOut' }}
                      style={{ position:'absolute', left:8, right:8, height:2 }}
                      className="bg-emerald-400 shadow-lg shadow-emerald-400/60 rounded"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-emerald-300 font-medium tracking-wider bg-black/40 px-2 py-0.5 rounded">
                        ALIGN DATE HERE
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                  <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
                    onClick={capture}
                    className="px-7 py-3 bg-emerald-600 text-white rounded-xl font-semibold flex items-center gap-2 shadow-xl">
                    <Camera size={18}/> Capture
                  </motion.button>
                  <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
                    onClick={() => setShowCamera(false)}
                    className="px-5 py-3 bg-gray-700/80 text-white rounded-xl font-medium flex items-center gap-2">
                    <X size={16}/> Cancel
                  </motion.button>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Make sure the date text is clear, well-lit and inside the guide box
              </p>
            </div>
          )}

          {/* Captured image + analysis panel */}
          {capturedImage && !showCamera && (
            <div className="grid md:grid-cols-2 gap-5">

              {/* Image preview */}
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                <img src={capturedImage} alt="Captured label" className="w-full h-auto"/>
              </div>

              {/* AI panel */}
              <div className="flex flex-col gap-3">

                {/* Result card */}
                {scanResult && (
                  <motion.div
                    initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}
                    className={`p-4 rounded-xl border ${scanResult.found ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
                  >
                    {scanResult.found ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="text-emerald-600 shrink-0" size={18}/>
                          <span className="text-sm font-semibold text-emerald-800">Date detected!</span>
                          {scanResult.confidence && (
                            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${confidenceColor(scanResult.confidence)}`}>
                              {scanResult.confidence}
                            </span>
                          )}
                        </div>
                        <p className="text-emerald-700 font-bold text-xl ml-6 mb-1">{scanResult.display || scanResult.date}</p>
                        <p className="text-xs text-emerald-600 ml-6">↓ Auto-filled in the form below</p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18}/>
                        <div>
                          <p className="text-sm font-semibold text-amber-800">No date found</p>
                          <p className="text-xs text-amber-700 mt-0.5">Retake a closer photo or enter the date manually</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Loading state */}
                {aiLoading && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Loader className="animate-spin text-emerald-600 shrink-0" size={20}/>
                      <div>
                        <p className="text-sm font-medium text-emerald-800">Analysing with AI…</p>
                        <p className="text-xs text-emerald-600 mt-0.5">{aiStatus}</p>
                      </div>
                    </div>
                    {/* Animated dots */}
                    <div className="flex gap-1.5 mt-3 ml-8">
                      {[0,1,2].map(i => (
                        <motion.div key={i}
                          animate={{ opacity:[0.3,1,0.3], scale:[0.8,1.2,0.8] }}
                          transition={{ duration:1.2, repeat:Infinity, delay:i*0.2 }}
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Scan button — before result */}
                {!scanResult && !aiLoading && (
                  <motion.button
                    whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                    onClick={analyseImage}
                    className="w-full py-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Wand2 size={26}/>
                        <Zap size={16} className="text-yellow-300"/>
                      </div>
                      <span className="font-semibold text-lg">Analyse with AI</span>
                      <span className="text-xs text-emerald-100">Powered by Puter · GPT-4o Vision · Free</span>
                    </div>
                  </motion.button>
                )}

                {/* Re-analyse */}
                {scanResult && !aiLoading && (
                  <button onClick={analyseImage}
                    className="w-full py-2.5 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2">
                    <Wand2 size={14}/> Re-analyse
                  </button>
                )}

                {/* Retake / Discard */}
                <div className="flex gap-2 mt-auto">
                  <button onClick={retake}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm">
                    <RotateCcw size={15}/> Retake
                  </button>
                  <button onClick={discard}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 text-sm">
                    <Trash2 size={15}/> Discard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Product Details Form ── */}
      <motion.div
        initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
      >
        <form onSubmit={handleSubmit} className="p-6">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-6">
            <Package className="text-emerald-600" size={20}/> Product Details
          </h2>

          <div className="space-y-6">

            {/* Product Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Package size={14} className="text-gray-500"/> Product Name <span className="text-rose-500">*</span>
              </label>
              <input type="text" name="name" value={formData.name} onChange={handleChange}
                placeholder="e.g., Organic Milk, Fresh Apples"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"/>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Tag size={14} className="text-gray-500"/> Category
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {categories.map(cat => {
                  const Icon = cat.icon;
                  return (
                    <motion.button key={cat.id} type="button"
                      whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                      onClick={() => setFormData(prev => ({ ...prev, category: cat.label }))}
                      className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${formData.category===cat.label ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200 bg-white'}`}>
                      <div className={`p-1.5 rounded-lg ${cat.bgColor}`}><Icon className={cat.textColor} size={16}/></div>
                      <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Expiry Date — glows when AI-filled */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar size={14} className="text-gray-500"/> Expiry Date
                {scanResult?.found && formData.expiryDate && (
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full border border-emerald-200">
                    <Zap size={10}/> AI filled
                  </span>
                )}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                <input type="date" name="expiryDate" value={formData.expiryDate} onChange={handleChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${
                    scanResult?.found && formData.expiryDate
                      ? 'border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-300'
                      : 'border-gray-200'
                  }`}
                />
              </div>
              {formData.expiryDate && (
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(formData.expiryDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday:'long', year:'numeric', month:'long', day:'numeric',
                  })}
                </p>
              )}
            </div>

            {/* Storage Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <MapPin size={14} className="text-gray-500"/> Storage Location
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {locations.map(loc => {
                  const Icon = loc.icon;
                  const bg = loc.color==='blue'?'bg-blue-50':loc.color==='amber'?'bg-amber-50':loc.color==='cyan'?'bg-cyan-50':'bg-gray-50';
                  const tx = loc.color==='blue'?'text-blue-600':loc.color==='amber'?'text-amber-600':loc.color==='cyan'?'text-cyan-600':'text-gray-600';
                  return (
                    <motion.button key={loc.id} type="button"
                      whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                      onClick={() => setFormData(prev => ({ ...prev, location: loc.label }))}
                      className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${formData.location===loc.label ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200 bg-white'}`}>
                      <div className={`p-1.5 rounded-lg ${bg}`}><Icon size={16} className={tx}/></div>
                      <span className="text-sm font-medium text-gray-700">{loc.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <FileText size={14} className="text-gray-500"/> Notes (Optional)
              </label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows="3"
                placeholder="Add any additional notes about the product…"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"/>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => navigate('/dashboard')}
                className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <motion.button type="submit" disabled={loading || !formData.name}
                whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg font-medium hover:from-emerald-700 hover:to-emerald-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm">
                {loading ? <><Loader className="animate-spin" size={18}/> Adding…</> : <><Plus size={18}/> Add Product</>}
              </motion.button>
            </div>
          </div>
        </form>
      </motion.div>

      {/* Quick Tips */}
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.25 }}
        className="mt-6 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
        <h3 className="text-sm font-medium text-emerald-800 flex items-center gap-2 mb-2">
          <Sparkles size={16}/> Quick Tips
        </h3>
        <ul className="text-xs text-emerald-700 space-y-1">
          <li className="flex items-center gap-2"><ChevronRight size={12}/> Hold camera steady — date text must be sharp and well-lit</li>
          <li className="flex items-center gap-2"><ChevronRight size={12}/> AI reads all formats: JUL 2026, 31/07/2026, 07/2026, 2026-07-31</li>
          <li className="flex items-center gap-2"><ChevronRight size={12}/> Puter AI may ask you to sign in once with a free Puter account</li>
          <li className="flex items-center gap-2"><ChevronRight size={12}/> If scan misses, retake closer — or type the date manually</li>
        </ul>
      </motion.div>

    </div>
  );
}

export default AddProduct;