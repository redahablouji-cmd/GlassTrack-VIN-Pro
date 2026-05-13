import React, { useState } from 'react';
import { analyzeLiveFrame, decodeVehiclePhotos } from '../services/api';

const FORENSIC_UI_MAP: any = {
  "Front Windshield": {
    intact: [
      { id: "photo1", title: "Photo A: The Sensor Depth (Interior Side-View)", desc: "45° angle from passenger seat. Focus on the rearview mirror physical mounting base (even if it's just bare plastic)." },
      { id: "photo2", title: "Photo B: The Frit Window (Exterior Top Center)", desc: "45° angle looking down at the black glass edge where wipers rest. Keep the area in focus." },
      { id: "photo3", title: "Photo C: The Silhouette & Tint (Full Exterior)", desc: "90° straight-on exterior. Ensure the entire shape of the front windshield fits clearly in the frame." }
    ],
    shattered: [
      { id: "photo1", title: "Photo 1: The Headliner Harness", desc: "Close-up of the interior ceiling directly above the mirror. Keep the headliner/wires in focus." },
      { id: "photo2", title: "Photo 2: The HUD 'Well'", desc: "Flat shot across the driver-side dashboard top. Keep the surface near the glass line in focus." },
      { id: "photo3", title: "Photo 3: The 'Universal Key' (Service Sticker)", desc: "Clear, straight-on macro shot of the manufacturer build sticker (B-Pillar). Text must be perfectly readable." }
    ]
  },
  "Lateral Glass": {
    intact: [
      { id: "photo1", title: "Photo A: The Position Check (Full Door View)", desc: "90° straight-on. Ensure the entire car door and window fit clearly in the frame." },
      { id: "photo2", title: "Photo B: The 'Bug' (Corner Stamp Macro)", desc: "Extreme close-up of the printed text/logo on the glass. Text must be perfectly in focus and readable." }
    ],
    shattered: [
      { id: "photo1", title: "Photo 1: The Master Window Switch", desc: "Macro close-up of the window control buttons on the driver armrest. Icons must be in focus." },
      { id: "photo2", title: "Photo 2: The Door Channel", desc: "Focus strictly on the empty window frame (rubber groove/track) at the top of the open door." },
      { id: "photo3", title: "Photo 3: The 'Universal Key' (Service Sticker)", desc: "Clear, straight-on macro shot of the manufacturer build sticker (B-Pillar). Text must be perfectly readable." }
    ]
  },
  "Rear Glass": {
    intact: [
      { id: "photo1", title: "Photo A: The Hardware Check (Full Rear View)", desc: "90° straight-on exterior. Ensure the entire rear window fits clearly in the frame." },
      { id: "photo2", title: "Photo B: The Technology Grid (Macro)", desc: "Close-up focused directly on the glass surface (ensure the camera does not focus on reflections)." }
    ],
    shattered: [
      { id: "photo1", title: "Photo 1: The Wiper Motor Stub", desc: "Focus on the center metal of the tailgate exactly where the bottom of the glass used to be." },
      { id: "photo2", title: "Photo 2: The C-Pillar Connectors", desc: "Focus on the interior side-frame (C-pillar) near the top trunk hinges." },
      { id: "photo3", title: "Photo 3: The 'Universal Key' (Service Sticker)", desc: "Clear, straight-on macro shot of the manufacturer build sticker. Text must be perfectly readable." }
    ]
  }
};

export default function HomeScreen() {
  const [position, setPosition] = useState<string>("Front Windshield");
  const [isShattered, setIsShattered] = useState<boolean>(false);
  
  // NEW: Reference Code Format Selector
  const [referenceFormat, setReferenceFormat] = useState<string>("Eurocode");
  
  const [vinImage, setVinImage] = useState<string | null>(null);
  const [proofImages, setProofImages] = useState<Record<string, string>>({});
  
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  // NEW: Toggle between Dashboard and Decoder
  const [currentView, setCurrentView] = useState<'dashboard' | 'decoder'>('dashboard');

  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeResults, setDecodeResults] = useState<any>(null);

  const currentChecklist = FORENSIC_UI_MAP[position][isShattered ? 'shattered' : 'intact'];

  // === BULLETPROOF COMPRESSOR ===
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error("الملف المحدد ليس صورة صالحة (Invalid file type)."));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        if (!base64Data) {
          reject(new Error("فشل في تحويل الصورة (Base64 generation failed)."));
          return;
        }

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            
            if (img.width <= MAX_WIDTH) {
              resolve(base64Data);
              return;
            }

            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas rendering failed");

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const finalImage = canvas.toDataURL('image/jpeg', 0.8);
            if (finalImage === "data:,") throw new Error("Canvas produced empty image");
            
            resolve(finalImage);
          } catch (err) {
            console.warn("Compression failed, sending original.", err);
            resolve(base64Data); 
          }
        };

        img.onerror = () => {
          reject(new Error("Browser cannot read this image format (e.g., HEIC)."));
        };

        img.src = base64Data;
      };
      
      reader.onerror = () => reject(new Error("فشل قراءة الملف (Storage read error)."));
      reader.readAsDataURL(file);
    });
  };

  const handleNativeCapture = async (e: React.ChangeEvent<HTMLInputElement>, item: any, isVin: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageId = isVin ? 'vin' : item.id;
    setValidatingId(imageId);
    setImageErrors(prev => ({ ...prev, [imageId]: "" })); 

    try {
      const base64 = await compressImage(file);
      setPreviewImages(prev => ({ ...prev, [imageId]: base64 }));

      const expectedPart = isVin 
        ? "VIN Barcode - WHAT TO LOOK FOR: A clear, readable 17-digit Vehicle Identification Number (VIN) barcode or text. Reject it if it is blurry, cut off, or illegible."
        : `${item.title} - WHAT TO LOOK FOR: ${item.desc}`;

      const aiResponse: any = await analyzeLiveFrame(base64, expectedPart);

      if (aiResponse.systemError) {
        setImageErrors(prev => ({ ...prev, [imageId]: `⚠️ النظام: ${aiResponse.systemError}` }));
        if (isVin) setVinImage(null); else {
          const newProofs = {...proofImages}; delete newProofs[imageId]; setProofImages(newProofs);
        }
      } else if (aiResponse.isPerfect) {
        if (isVin) setVinImage(base64);
        else setProofImages(prev => ({ ...prev, [imageId]: base64 }));
      } else {
        setImageErrors(prev => ({ ...prev, [imageId]: `❌ ${aiResponse.arabicInstruction}` }));
        if (isVin) setVinImage(null); else {
          const newProofs = {...proofImages}; delete newProofs[imageId]; setProofImages(newProofs);
        }
      }
    } catch (err: any) {
      console.error("RAW CRASH DATA:", err);
      let exactError = "Unknown Crash";
      if (err?.message) exactError = err.message;
      else if (typeof err === 'string') exactError = err;
      else exactError = JSON.stringify(err);
      
      setImageErrors(prev => ({ ...prev, [imageId]: `⚠️ Error: ${exactError}` }));
    } finally {
      setValidatingId(null);
      e.target.value = ''; 
    }
  };

  const handleFinalUpload = async () => {
    setIsDecoding(true);
    const formattedProofImages: Record<string, string> = {};
    currentChecklist.forEach((item: any) => {
      if (proofImages[item.id]) {
        formattedProofImages[`${item.title} - WHAT TO LOOK FOR: ${item.desc}`] = proofImages[item.id];
      }
    });

    const payload = { 
      vinImage, 
      position, 
      isShattered, 
      referenceFormat,
      proofImages: formattedProofImages 
    };

    try {
      const result = await decodeVehiclePhotos(payload);
      setDecodeResults(result);
    } catch (error: any) {
      // FIX: Show the exact error instead of the generic Arabic message
      alert(`Crash Details:\n${error.message || JSON.stringify(error)}`);
    } finally {
      setIsDecoding(false);
    }
  };

  const SuccessBadge = () => (
    <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1 border-2 border-gray-900 shadow-lg z-10">
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
    </div>
  );
// DUMMY DATA: We will connect this to Supabase later
  const historyLog = [
    { id: 1, date: 'Today, 10:45 AM', car: 'SEAT Ibiza V', code: '7653AGAMVZ', desc: 'Acoustic Glass, Rain Sensor, NO Camera' },
    { id: 2, date: 'Yesterday', car: 'Hyundai Santa Fe', code: '4148AGN', desc: 'Solar Tinted, Base Model' }
  ];
    return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-4 pb-28">
      
      {/* HEADER: Clean, Professional, Minimal */}
      <header className="flex justify-between items-center mb-8 pt-4">
        <h1 className="text-2xl font-black tracking-tighter text-gray-900">
          LOWFX<span className="text-blue-600">GLASS</span>
        </h1>
        {currentView === 'decoder' && (
          <button 
            onClick={() => setCurrentView('dashboard')} 
            className="text-sm font-bold text-gray-500 hover:text-gray-900 bg-gray-200 px-4 py-2 rounded-full transition-all"
          >
            Cancel
          </button>
        )}
      </header>

      {/* ========================================= */}
      {/* VIEW 1: THE DASHBOARD & HISTORY           */}
      {/* ========================================= */}
      {currentView === 'dashboard' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* THE BIG "NEW DECODE" BUTTON */}
          <button 
            onClick={() => setCurrentView('decoder')}
            className="w-full bg-blue-600 text-white rounded-3xl p-6 shadow-xl shadow-blue-600/20 flex flex-col items-center justify-center gap-4 mb-10 transform active:scale-95 transition-all"
          >
            <div className="bg-white/20 p-4 rounded-full">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">Decode New Vehicle</h2>
              <p className="text-blue-100 text-sm font-medium mt-1">Scan VIN and Capture Hardware</p>
            </div>
          </button>

          {/* HISTORY SECTION (Mockup for now) */}
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 ml-2">Recent Decodes</h3>
          <div className="space-y-3">
            {/* We will map real Supabase data here later */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-400">Today, 10:45 AM</span>
                <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-md">SEAT Ibiza V</span>
              </div>
              <div className="text-2xl font-black font-mono text-gray-900 tracking-wider">7653AGAMVZ</div>
              <div className="text-sm text-gray-500 font-medium">Acoustic Glass, Rain Sensor, NO Camera</div>
            </div>
          </div>
        </div>
      ) : (

      /* ========================================= */
      /* VIEW 2: THE NEW FUTURISTIC SCANNER        */
      /* ========================================= */
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          
          {/* VEHICLE CONFIGURATION CARD */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Configuration</h2>
            
            <select 
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-gray-900 font-semibold mb-3 outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              value={position}
              onChange={(e) => { setPosition(e.target.value); setProofImages({}); setPreviewImages({}); setImageErrors({}); }}
            >
              <option value="Front Windshield">Front Windshield</option>
              <option value="Lateral Glass">Lateral Glass (Doors)</option>
              <option value="Rear Glass">Rear Glass (Trunk/Hatch)</option>
            </select>

            <select 
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-gray-900 font-semibold mb-4 outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              value={referenceFormat}
              onChange={(e) => setReferenceFormat(e.target.value)}
            >
              <option value="Eurocode">Extract Standard Eurocode</option>
              <option value="NAGS">Extract NAGS Code</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => { setIsShattered(false); setProofImages({}); setPreviewImages({}); setImageErrors({}); }} className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-all ${!isShattered ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>Glass Intact</button>
              <button onClick={() => { setIsShattered(true); setProofImages({}); setPreviewImages({}); setImageErrors({}); }} className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-all ${isShattered ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>Shattered / Missing</button>
            </div>
          </div>

          {/* CAPTURE VIN CARD */}
          <div className={`bg-white p-5 rounded-3xl shadow-sm border mb-6 ${imageErrors['vin'] ? 'border-red-500' : 'border-gray-100'} relative`}>
            {vinImage && <div className="absolute -top-3 -right-3 bg-green-500 text-white p-2 rounded-full shadow-lg border-4 border-gray-50"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>}
            
            <div className="flex justify-between items-start gap-4 mb-4">
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-lg">1. Capture VIN</h3>
                <p className="text-xs text-gray-500 font-medium mt-1">{vinImage ? 'VIN Approved' : 'Required for precise matching'}</p>
                {validatingId === 'vin' && <p className="text-yellow-600 text-xs font-bold mt-2 animate-pulse dir-rtl">جاري الفحص...</p>}
                {imageErrors['vin'] && <p className="mt-2 text-red-600 text-xs font-bold dir-rtl break-words">{imageErrors['vin']}</p>}
              </div>
              <div className="w-16 h-16 shrink-0 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                {validatingId === 'vin' ? (
                     <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                  ) : previewImages['vin'] ? (
                    <img src={previewImages['vin']} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-16v16M4 4v16m4-16v16m8-16v16" /></svg>
                  )}
              </div>
            </div>

            <div className="flex gap-3">
              <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                <input type="file" accept="image/jpeg, image/png, image/webp" capture="environment" className="hidden" onChange={(e) => handleNativeCapture(e, { id: 'vin' }, true)} disabled={validatingId === 'vin'} />
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-sm font-bold">Camera</span>
              </label>
              <label className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer border border-gray-200">
                <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={(e) => handleNativeCapture(e, { id: 'vin' }, true)} disabled={validatingId === 'vin'} />
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-sm font-bold">Gallery</span>
              </label>
            </div>
          </div>

          {/* DIAGNOSTIC PHOTOS */}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 ml-2">Diagnostic Hardware Photos</h2>
          
          <div className="space-y-4">
            {currentChecklist.map((item: any, index: number) => (
              <div key={item.id} className={`bg-white p-5 rounded-3xl shadow-sm border ${imageErrors[item.id] ? 'border-red-500' : 'border-gray-100'} relative`}>
                {proofImages[item.id] && <div className="absolute -top-3 -right-3 bg-green-500 text-white p-2 rounded-full shadow-lg border-4 border-gray-50"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>}
                
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg">{index + 2}. {item.title}</h3>
                    <p className="text-xs text-gray-500 font-medium mt-2 leading-relaxed">{item.desc}</p>
                    {validatingId === item.id && <p className="text-yellow-600 text-xs font-bold mt-2 animate-pulse dir-rtl">جاري الفحص...</p>}
                    {imageErrors[item.id] && <p className="mt-2 text-red-600 text-xs font-bold dir-rtl break-words">{imageErrors[item.id]}</p>}
                  </div>
                  <div className="w-16 h-16 shrink-0 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                    {validatingId === item.id ? (
                       <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                    ) : previewImages[item.id] ? (
                      <img src={previewImages[item.id]} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                    <input type="file" accept="image/jpeg, image/png, image/webp" capture="environment" className="hidden" onChange={(e) => handleNativeCapture(e, item)} disabled={validatingId === item.id} />
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className="text-sm font-bold">Camera</span>
                  </label>
                  <label className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer border border-gray-200">
                    <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={(e) => handleNativeCapture(e, item)} disabled={validatingId === item.id} />
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-sm font-bold">Gallery</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* LIGHT THEME RESULTS CARD */}
          {decodeResults && (
            <div className={`mt-8 border rounded-3xl p-6 shadow-sm ${decodeResults.needsMorePhotos ? 'bg-red-50 border-red-200' : 'bg-white border-blue-100'}`}>
              <h3 className={`font-black text-lg mb-4 pb-3 border-b ${decodeResults.needsMorePhotos ? 'text-red-600 border-red-100' : 'text-blue-600 border-blue-50'}`}>
                {decodeResults.needsMorePhotos ? '⚠️ AI Requires More Information' : '✅ Vision Extraction Complete'}
              </h3>
              
              {decodeResults.needsMorePhotos ? (
                <p className="text-sm text-gray-700 font-medium leading-relaxed">{decodeResults.missingPhotoReason}</p>
              ) : (
                <div className="space-y-4">
                  {/* AI LOGIC DEBUGGER */}
                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl">
                    <span className="flex items-center gap-2 text-yellow-800 text-xs font-bold uppercase mb-2 tracking-wider">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Internal Vision Logic
                    </span>
                    <span className="text-yellow-900 text-sm leading-relaxed font-mono">
                      {decodeResults.internalVerificationCheck || "No logic provided by AI."}
                    </span>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex justify-between items-center">
                    <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Vehicle</span>
                    <span className="text-gray-900 font-bold">{decodeResults.vehicle_data?.make} {decodeResults.vehicle_data?.model} ({decodeResults.vehicle_data?.year})</span>
                  </div>
                  
                  {/* Note: primaryCode and descriptiveCode will be N/A until Supabase is linked */}
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex justify-between items-center">
                    <span className="text-blue-700 text-xs font-bold uppercase tracking-wider">{referenceFormat}</span>
                    <span className="text-blue-900 font-mono text-2xl font-black tracking-widest">{decodeResults.primaryCode || "N/A"}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* THE MASTER INITIATE BUTTON (Floating at bottom) */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent pt-10 z-50">
            <button 
              onClick={handleFinalUpload}
              disabled={isDecoding || !vinImage || Object.keys(proofImages).length < currentChecklist.length}
              className={`w-full py-5 rounded-3xl font-black text-lg shadow-xl transition-all flex justify-center items-center gap-2 ${
                isDecoding ? 'bg-gray-300 text-gray-500 cursor-wait' :
                (!vinImage || Object.keys(proofImages).length < currentChecklist.length) ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-gray-900 text-white active:scale-95 hover:bg-black shadow-gray-900/30'
              }`}
            >
              {isDecoding ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  جاري التحليل...
                </>
              ) : 'INITIATE VIN DECODE'}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}