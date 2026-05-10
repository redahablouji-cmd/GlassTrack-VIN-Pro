import React, { useState } from 'react';
import { analyzeLiveFrame, decodeVehiclePhotos } from '../services/api';

const FORENSIC_UI_MAP: any = {
  "Front Windshield": {
    intact: [
      { id: "photo1", title: "Photo A: The Sensor Depth (Interior Side-View)", desc: "45° angle from the passenger seat looking toward the rearview mirror bracket. Shows Rain Sensor/LDWS profile." },
      { id: "photo2", title: "Photo B: The Heater Grid (Exterior Cowl-View)", desc: "Looking down at a 45° angle at the black area where wiper blades rest. Look for heated orange wires." },
      { id: "photo3", title: "Photo C: The Silhouette & Tint (Full Exterior)", desc: "90° straight-on from the front. Confirms Shade Band and HUD windows." }
    ],
    shattered: [
      { id: "photo1", title: "Photo 1: The Headliner Harness", desc: "Close-up above rearview mirror. Look for dangling 10-pin green connector or LVDS cable." },
      { id: "photo2", title: "Photo 2: The HUD 'Well'", desc: "Flat shot across driver dashboard looking for a deep rectangular sink/hole." },
      { id: "photo3", title: "Photo 3: The 'Universal Key' (Service Sticker)", desc: "90° straight-on at the manufacturer sticker inside the driver’s door frame (B-Pillar)." }
    ]
  },
  "Lateral Glass": {
    intact: [
      { id: "photo1", title: "Photo A: The Position Check (Full Door View)", desc: "90° straight-on facing the door. Confirms FL/RR and encapsulation." },
      { id: "photo2", title: "Photo B: The 'Bug' (Corner Stamp Macro)", desc: "Extreme close-up of the glass manufacturer logo. Proves Tempered vs Acoustic." }
    ],
    shattered: [
      { id: "photo1", title: "Photo 1: The Master Window Switch", desc: "Crystal-clear macro of driver armrest buttons. 'Auto' usually means Acoustic." },
      { id: "photo2", title: "Photo 2: The Door Channel", desc: "Shot of the empty rubber groove to check thickness." },
      { id: "photo3", title: "Photo 3: The 'Universal Key' (Service Sticker)", desc: "Sticker in the Driver Door Jamb containing PR-Codes." }
    ]
  },
  "Rear Glass": {
    intact: [
      { id: "photo1", title: "Photo A: The Hardware Check (Full Rear View)", desc: "90° straight-on from rear bumper. Detects Wiper Hole and body style." },
      { id: "photo2", title: "Photo B: The Technology Grid (Macro)", desc: "Close-up of glass center/corner to check for integrated antenna lines." }
    ],
    shattered: [
      { id: "photo1", title: "Photo 1: The Wiper Motor Stub", desc: "Tailgate center shot. Metal spindle = hole required. No spindle = solid." },
      { id: "photo2", title: "Photo 2: The C-Pillar Connectors", desc: "Metal tabs/wires hanging near trunk hinges." },
      { id: "photo3", title: "Photo 3: The 'Universal Key' (Service Sticker)", desc: "Sticker in Door Jamb or Spare Tire Well." }
    ]
  }
};

export default function HomeScreen() {
  const [position, setPosition] = useState<string>("Front Windshield");
  const [isShattered, setIsShattered] = useState<boolean>(false);
  const [vinImage, setVinImage] = useState<string | null>(null);
  const [proofImages, setProofImages] = useState<Record<string, string>>({});
  
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});

  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeResults, setDecodeResults] = useState<any>(null);

  const currentChecklist = FORENSIC_UI_MAP[position][isShattered ? 'shattered' : 'intact'];

  // === NEW: IMAGE COMPRESSION ENGINE ===
  // Shrinks massive phone photos down so they bypass Vercel's 4.5MB limits (fixes HTTP 413)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200; // Perfect resolution for AI, tiny file size
          const scaleSize = MAX_WIDTH / img.width;
          
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Export as JPEG at 75% quality
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleNativeCapture = async (e: React.ChangeEvent<HTMLInputElement>, item: any, isVin: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageId = isVin ? 'vin' : item.id;
    setValidatingId(imageId);
    setImageErrors(prev => ({ ...prev, [imageId]: "" })); 

    try {
      // Compress the image before doing anything else!
      const base64 = await compressImage(file);
      
      const expectedPart = isVin 
        ? "VIN Barcode - WHAT TO LOOK FOR: A clear, readable 17-digit Vehicle Identification Number (VIN) barcode or text. Reject it if it is blurry, cut off, or illegible."
        : `${item.title} - WHAT TO LOOK FOR: ${item.desc}`;

      const aiResponse: any = await analyzeLiveFrame(base64, expectedPart);

      if (aiResponse.systemError) {
        setImageErrors(prev => ({ ...prev, [imageId]: `⚠️ النظام: ${aiResponse.systemError}` }));
        e.target.value = '';
        if (isVin) setVinImage(null);
      } else if (aiResponse.isPerfect) {
        if (isVin) setVinImage(base64);
        else setProofImages(prev => ({ ...prev, [imageId]: base64 }));
      } else {
        setImageErrors(prev => ({ ...prev, [imageId]: `❌ ${aiResponse.arabicInstruction}` }));
        e.target.value = '';
        if (isVin) setVinImage(null);
      }
    } catch (err: any) {
      setImageErrors(prev => ({ ...prev, [imageId]: `⚠️ Network Error: ${err.message || 'Connection lost'}` }));
      e.target.value = '';
    } finally {
      setValidatingId(null);
    }
  };

  const handleFinalUpload = async () => {
    setIsDecoding(true);
    const formattedProofImages: Record<string, string> = {};
    
    currentChecklist.forEach((item: any) => {
      if (proofImages[item.id]) {
        const fullAIInstruction = `${item.title} - WHAT TO LOOK FOR: ${item.desc}`;
        formattedProofImages[fullAIInstruction] = proofImages[item.id];
      }
    });

    const payload = { vinImage, position, isShattered, proofImages: formattedProofImages };

    try {
      const result = await decodeVehiclePhotos(payload);
      setDecodeResults(result);
    } catch (error) {
      alert("فشل في تحليل البيانات. تأكد من اتصالك بالإنترنت.");
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
        <p className="text-gray-400 text-sm mt-1">B2B Homologation & Inventory</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 mb-6 shadow-lg border border-gray-700">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Vehicle Configuration</h2>
        <select 
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white mb-4 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          value={position}
          onChange={(e) => { setPosition(e.target.value); setProofImages({}); setImageErrors({}); }}
        >
          <option value="Front Windshield">Front Windshield</option>
          <option value="Lateral Glass">Lateral Glass (Doors)</option>
          <option value="Rear Glass">Rear Glass (Trunk/Hatch)</option>
        </select>
        <div className="flex gap-2">
          <button onClick={() => { setIsShattered(false); setProofImages({}); setImageErrors({}); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors ${!isShattered ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-700'}`}>Glass Intact</button>
          <button onClick={() => { setIsShattered(true); setProofImages({}); setImageErrors({}); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors ${isShattered ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-700'}`}>Missing / Shattered</button>
        </div>
      </div>

      <div className="mb-6 relative">
        <input type="file" accept="image/*" capture="environment" className="hidden" id="vin-upload" onChange={(e) => handleNativeCapture(e, { id: 'vin' }, true)} disabled={validatingId === 'vin'} />
        <label htmlFor="vin-upload" className={`block w-full bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg transition-transform cursor-pointer relative ${validatingId === 'vin' ? 'opacity-50 cursor-wait' : 'active:scale-[0.98]'}`}>
          {vinImage && <SuccessBadge />}
          <div className="flex items-start gap-4">
            <div className={`p-3 shrink-0 rounded-lg ${vinImage ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {validatingId === 'vin' ? (
                <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-16v16M4 4v16m4-16v16m8-16v16" /></svg>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white">Capture VIN Barcode</h3>
              <p className="text-gray-400 text-xs mt-1">{vinImage ? 'VIN Checked & Approved' : 'Required for precise database matching'}</p>
              
              {validatingId === 'vin' && (
                <p className="text-yellow-400 text-xs font-bold mt-3 animate-pulse dir-rtl">جاري فحص الـ VIN بالذكاء الاصطناعي...</p>
              )}
              {imageErrors['vin'] && (
                <div className="mt-3 bg-red-900/40 border border-red-500/50 rounded p-2">
                  <p className="text-red-400 text-xs font-bold dir-rtl break-words">{imageErrors['vin']}</p>
                </div>
              )}
            </div>
          </div>
        </label>
      </div>

      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Required Diagnostic Photos</h2>
      <div className="space-y-4">
        {currentChecklist.map((item: any) => (
          <div key={item.id} className="relative">
            <input type="file" accept="image/*" capture="environment" className="hidden" id={`upload-${item.id}`} onChange={(e) => handleNativeCapture(e, item)} disabled={validatingId === item.id} />
            <label htmlFor={`upload-${item.id}`} className={`block w-full bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg transition-transform cursor-pointer relative ${validatingId === item.id ? 'opacity-50 cursor-wait' : 'active:scale-[0.98]'}`}>
              {proofImages[item.id] && <SuccessBadge />}
              
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h3 className={`font-bold text-sm ${proofImages[item.id] ? 'text-green-400' : 'text-blue-400'}`}>{item.title}</h3>
                  <p className="text-gray-400 text-xs mt-2 leading-relaxed">{item.desc}</p>
                  
                  {validatingId === item.id && (
                    <p className="text-yellow-400 text-xs font-bold mt-3 animate-pulse dir-rtl">جاري فحص الصورة بالذكاء الاصطناعي...</p>
                  )}
                  {imageErrors[item.id] && (
                    <div className="mt-3 bg-red-900/40 border border-red-500/50 rounded p-2">
                      <p className="text-red-400 text-xs font-bold dir-rtl break-words">{imageErrors[item.id]}</p>
                    </div>
                  )}
                </div>
                
                <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
                  {validatingId === item.id ? (
                     <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  ) : proofImages[item.id] ? (
                    <img src={proofImages[item.id]} alt="Captured" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </div>
              </div>
            </label>
          </div>
        ))}
      </div>

      {decodeResults && (
        <div className="mt-8 bg-blue-900/30 border border-blue-500/50 rounded-xl p-5 backdrop-blur-sm">
          <h3 className="font-bold text-blue-400 mb-2">AI Decode Complete</h3>
          <p className="text-sm"><span className="text-gray-400">VIN:</span> {decodeResults.decodedVIN}</p>
          <p className="text-sm mt-1"><span className="text-gray-400">Eurocode:</span> <span className="font-mono text-white font-bold">{decodeResults.eurocode}</span></p>
          <p className="text-xs text-gray-300 mt-3 pt-3 border-t border-blue-500/30">{decodeResults.analysisNotes}</p>
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
          {isDecoding ? 'جاري التحليل بالذكاء الاصطناعي...' : 'INITIATE VIN DECODE'}
        </button>
      </div>

    </div>
  );
}