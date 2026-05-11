import React, { useState } from 'react';
import { analyzeLiveFrame, decodeVehiclePhotos } from '../services/api';

const FORENSIC_UI_MAP: any = {
  "Front Windshield": {
    intact: [
      { id: "photo1", title: "Photo A: The Sensor Depth (Interior Side-View)", desc: "45° angle from passenger seat. Focus on the rearview mirror physical mounting base (even if it's just bare plastic)." },
      { id: "photo2", title: "Photo B: The Heater Grid (Exterior Cowl-View)", desc: "45° angle looking down at the black glass edge where wipers rest. Keep the area in focus." },
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 pb-24 font-sans">
      <div className="mb-8 mt-4">
        <h1 className="text-2xl font-bold tracking-wide">LOWFX <span className="text-blue-500">GLASS</span></h1>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 mb-6 shadow-lg border border-gray-700">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Vehicle Configuration</h2>
        
        <select 
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white mb-4 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          value={position}
          onChange={(e) => { setPosition(e.target.value); setProofImages({}); setPreviewImages({}); setImageErrors({}); }}
        >
          <option value="Front Windshield">Front Windshield</option>
          <option value="Lateral Glass">Lateral Glass (Doors)</option>
          <option value="Rear Glass">Rear Glass (Trunk/Hatch)</option>
        </select>

        {/* NEW DROPDOWN: Target Reference Format */}
        {/* NEW DROPDOWN: Target Reference Format */}
        <select 
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white mb-4 focus:border-blue-500 outline-none"
          value={referenceFormat}
          onChange={(e) => setReferenceFormat(e.target.value)}
        >
          <option value="Eurocode">Extract Standard Eurocode</option>
          <option value="NAGS">Extract NAGS Code</option>
        </select>

        <div className="flex gap-2">
          <button onClick={() => { setIsShattered(false); setProofImages({}); setPreviewImages({}); setImageErrors({}); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors ${!isShattered ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-700'}`}>Glass Intact</button>
          <button onClick={() => { setIsShattered(true); setProofImages({}); setPreviewImages({}); setImageErrors({}); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors ${isShattered ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-700'}`}>Missing / Shattered</button>
        </div>
      </div>

      {/* VIN SECTION */}
      <div className="mb-6">
        <div className={`w-full bg-gray-800 border ${imageErrors['vin'] ? 'border-red-500' : 'border-gray-700'} rounded-xl p-5 shadow-lg relative`}>
          {vinImage && <SuccessBadge />}
          <div className="flex items-start gap-4 mb-4">
            <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
                {validatingId === 'vin' ? (
                     <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  ) : previewImages['vin'] ? (
                    <img src={previewImages['vin']} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-16v16M4 4v16m4-16v16m8-16v16" /></svg>
                  )}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white">Capture VIN</h3>
              <p className="text-gray-400 text-xs mt-1">{vinImage ? 'VIN Approved' : 'Required for precise matching'}</p>
              {validatingId === 'vin' && <p className="text-yellow-400 text-xs font-bold mt-2 animate-pulse dir-rtl">جاري الفحص...</p>}
              {imageErrors['vin'] && <p className="mt-2 text-red-400 text-xs font-bold dir-rtl break-words">{imageErrors['vin']}</p>}
            </div>
          </div>
          
          {/* DUAL BUTTONS FOR VIN */}
          <div className="flex gap-2">
            <label className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg text-center cursor-pointer text-sm font-bold transition-colors shadow-md">
              <input type="file" accept="image/jpeg, image/png, image/webp" capture="environment" className="hidden" onChange={(e) => handleNativeCapture(e, { id: 'vin' }, true)} disabled={validatingId === 'vin'} />
              📷 Camera
            </label>
            <label className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg text-center cursor-pointer text-sm font-bold transition-colors shadow-md">
              <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={(e) => handleNativeCapture(e, { id: 'vin' }, true)} disabled={validatingId === 'vin'} />
              🖼️ Gallery
            </label>
          </div>
        </div>
      </div>

      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Required Diagnostic Photos</h2>
      <div className="space-y-4">
        {currentChecklist.map((item: any) => (
          <div key={item.id} className="relative">
            <div className={`w-full bg-gray-800 border ${imageErrors[item.id] ? 'border-red-500' : 'border-gray-700'} rounded-xl p-4 shadow-lg relative`}>
              {proofImages[item.id] && <SuccessBadge />}
              
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="flex-1">
                  <h3 className={`font-bold text-sm ${proofImages[item.id] ? 'text-green-400' : imageErrors[item.id] ? 'text-red-400' : 'text-blue-400'}`}>{item.title}</h3>
                  <p className="text-gray-400 text-xs mt-2 leading-relaxed">{item.desc}</p>
                  {validatingId === item.id && <p className="text-yellow-400 text-xs font-bold mt-2 animate-pulse dir-rtl">جاري الفحص...</p>}
                  {imageErrors[item.id] && <p className="mt-2 text-red-400 text-xs font-bold dir-rtl break-words">{imageErrors[item.id]}</p>}
                </div>
                <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
                  {validatingId === item.id ? (
                     <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  ) : previewImages[item.id] ? (
                    <img src={previewImages[item.id]} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </div>
              </div>

              {/* DUAL BUTTONS FOR EVERY PHOTO */}
              <div className="flex gap-2">
                <label className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-center cursor-pointer text-xs font-bold transition-colors shadow-md">
                  <input type="file" accept="image/jpeg, image/png, image/webp" capture="environment" className="hidden" onChange={(e) => handleNativeCapture(e, item)} disabled={validatingId === item.id} />
                  📷 Camera
                </label>
                <label className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-center cursor-pointer text-xs font-bold transition-colors shadow-md">
                  <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={(e) => handleNativeCapture(e, item)} disabled={validatingId === item.id} />
                  🖼️ Gallery
                </label>
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* NEW: Upgraded Results Card with Descriptive Code */}
      {/* NEW: Results Card with Chain-of-Thought Debugging */}
      {decodeResults && (
        <div className={`mt-8 mb-24 border rounded-xl p-5 backdrop-blur-sm shadow-2xl ${decodeResults.needsMorePhotos ? 'bg-red-900/30 border-red-500/50' : 'bg-blue-900/20 border-blue-500/50'}`}>
          <h3 className={`font-bold text-lg mb-4 pb-3 border-b ${decodeResults.needsMorePhotos ? 'text-red-400 border-red-500/30' : 'text-blue-400 border-blue-500/30'}`}>
            {decodeResults.needsMorePhotos ? '⚠️ AI Requires More Information' : '✅ AI Decode Complete'}
          </h3>
          
          {decodeResults.needsMorePhotos ? (
            <p className="text-sm text-white font-medium leading-relaxed">{decodeResults.missingPhotoReason}</p>
          ) : (
            <div className="space-y-4">
              
              {/* THE AI LOGIC DEBUGGER (Chain of Thought) */}
              <div className="bg-yellow-900/20 border border-yellow-500/40 p-4 rounded-lg shadow-inner">
                <span className="flex items-center gap-2 text-yellow-400 text-xs font-bold uppercase mb-2 tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Internal Verification Check (AI Logic)
                </span>
                <span className="text-yellow-100 text-sm leading-relaxed font-mono">
                  {decodeResults.internalVerificationCheck || "No logic provided by AI."}
                </span>
              </div>

              {/* The VIN Row */}
              <div className="flex justify-between items-center bg-gray-900/60 p-3 rounded-lg border border-gray-700/50 mt-4">
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">VIN Detected</span>
                <span className="text-white font-mono font-bold tracking-wider">{decodeResults.decodedVIN || "Unknown"}</span>
              </div>
              
              {/* The Primary Code Row */}
              <div className="flex justify-between items-center bg-blue-600/20 border border-blue-500/40 p-4 rounded-lg">
                <span className="text-blue-300 text-xs font-bold uppercase tracking-wider">{referenceFormat}</span>
                <span className="text-white font-mono text-2xl font-black tracking-widest">{decodeResults.primaryCode || "N/A"}</span>
              </div>

              {/* The Descriptive Code Block */}
              <div className="bg-gray-800/80 border border-gray-600 p-4 rounded-lg shadow-inner">
                <span className="block text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">Detailed Description</span>
                <span className="text-gray-100 text-sm leading-relaxed font-medium">{decodeResults.descriptiveCode || "No description provided."}</span>
              </div>

            </div>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-50">
        <button 
          onClick={handleFinalUpload}
          disabled={isDecoding || !vinImage || Object.keys(proofImages).length < currentChecklist.length}
          className={`w-full py-4 rounded-xl font-bold text-lg shadow-xl transition-all ${
            isDecoding ? 'bg-gray-700 text-gray-400 cursor-wait' :
            (!vinImage || Object.keys(proofImages).length < currentChecklist.length) ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white active:scale-95'
          }`}
        >
          {isDecoding ? 'جاري التحليل...' : 'INITIATE VIN DECODE'}
        </button>
      </div>
    </div>
  );
}