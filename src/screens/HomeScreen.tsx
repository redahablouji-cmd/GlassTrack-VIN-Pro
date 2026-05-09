import React, { useState, useRef } from 'react';
import CustomCamera from './CustomCamera';
import { analyzeLiveFrame, decodeVehiclePhotos } from '../services/api';

// --- THE FORENSIC LOGIC ENGINE ---
const DIAGNOSTIC_PROTOCOLS = {
  windshield: {
    intact: [
      { id: 'mirror_bracket', label: 'Interior Mirror Bracket', icon: '📐', desc: '45° side-angle from inside to reveal hidden sensors.' },
      { id: 'bottom_cowl', label: 'Bottom Cowl / Wipers', icon: '📏', desc: 'Exterior 45° looking down. Captures heated wiper park.' },
      { id: 'full_exterior', label: 'Full Exterior View', icon: '🚘', desc: '90° straight on. Silhouette and top shade band.' }
    ],
    shattered: [
      { id: 'b_pillar', label: 'B-Pillar Sticker', icon: '🏷️', desc: '90° straight on driver door jamb PR-Codes.' },
      { id: 'dash_hud', label: 'Dashboard Top', icon: '🎛️', desc: 'Interior flat across dash. Checking for HUD hole.' },
      { id: 'roof_wires', label: 'Dangling Roof Wires', icon: '🔌', desc: 'Interior looking up at headliner wire plugs.' }
    ]
  },
  rear_glass: {
    intact: [
      { id: 'full_rear', label: 'Full Center Rear View', icon: '🚙', desc: '90° straight on. Checking wiper holes and grids.' },
      { id: 'rear_stamp', label: 'Technical Corner Stamp', icon: '🔍', desc: 'Macro/Close-up of bottom corner logo.' }
    ],
    shattered: [
      { id: 'b_pillar', label: 'B-Pillar Sticker', icon: '🏷️', desc: '90° straight on driver door jamb PR-Codes.' },
      { id: 'empty_frame', label: 'Empty Hatch/Trunk Frame', icon: '🖼️', desc: 'Full view of the rear frame where glass sat.' }
    ]
  },
  side_glass: {
    intact: [
      { id: 'full_door', label: 'Full Door/Window View', icon: '🚪', desc: '90° straight on. Verifying encapsulation molding.' },
      { id: 'side_stamp', label: 'The Bug / Corner Stamp', icon: '🔬', desc: 'Macro close-up. Checking Acoustic vs Tempered.' }
    ],
    shattered: [
      { id: 'b_pillar', label: 'B-Pillar Sticker', icon: '🏷️', desc: '90° straight on driver door jamb PR-Codes.' },
      { id: 'empty_door', label: 'Empty Door Frame', icon: '🖼️', desc: 'Full view of the door frame.' }
    ]
  }
};

type PositionType = 'windshield' | 'rear_glass' | 'side_glass' | null;

export default function HomeScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [vinImage, setVinImage] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionType>(null);
  const [isShattered, setIsShattered] = useState<boolean>(false);
  const [proofImages, setProofImages] = useState<Record<string, string>>({});
  
  // State for the Instruction Modal
  const [activeInstruction, setActiveInstruction] = useState<any>(null);

  const vinInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const processImage = (file: File, callback: (base64: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleVinCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImage(e.target.files[0], setVinImage);
      setStep(2); // Auto-advance after VIN
    }
  };

  const handleProofCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeInstruction) {
      processImage(e.target.files[0], (base64) => {
        setProofImages(prev => ({ ...prev, [activeInstruction.id]: base64 }));
        setActiveInstruction(null); // Close modal after capture
      });
    }
  };

  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeResults, setDecodeResults] = useState<any>(null);

  const handleFinalUpload = async () => {
    setIsDecoding(true);
    const payload = { vinImage, position, isShattered, proofImages };
    
    try {
      // Send the payload to Gemini 3.1 Pro
      const result = await decodeVehiclePhotos(payload);
      setDecodeResults(result);
      console.log("DECODE SUCCESS:", result);
    } catch (error) {
      alert("Failed to decode the vehicle. Please try again.");
    } finally {
      setIsDecoding(false);
    }
  };

  // Get current requirement list
  const currentRequirements = position 
    ? DIAGNOSTIC_PROTOCOLS[position][isShattered ? 'shattered' : 'intact'] 
    : [];

  const allProofsCaptured = currentRequirements.length > 0 && 
    currentRequirements.every(req => proofImages[req.id]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-8 px-4 font-sans text-gray-800 pb-20">
      
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold">TB</div>
          <span className="font-bold text-gray-800">Tech Bouncer HQ</span>
        </div>
        <button className="text-gray-400 text-sm font-bold hover:text-gray-600">LOGOUT</button>
      </div>

      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative">
        
        {/* STEP 1: VIN Capture */}
        {step >= 1 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-gray-400 mb-4 tracking-wider uppercase flex justify-between">
              <span>1. Global Identifier</span>
              {step > 1 && <button onClick={() => setStep(1)} className="text-blue-500">EDIT</button>}
            </h3>
            
            <div 
              onClick={() => step === 1 && vinInputRef.current?.click()}
              className={`w-full h-24 border-2 border-dashed rounded-xl flex items-center justify-center transition-colors ${
                vinImage ? 'border-green-400 bg-green-50' : 'border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100'
              }`}
            >
              {vinImage ? (
                <div className="text-green-600 font-bold flex items-center gap-2"><span className="text-2xl">✅</span> VIN EXTRACTED</div>
              ) : (
                <div className="text-blue-600 font-bold flex items-center gap-2"><span className="text-2xl">📷</span> SCAN VIN BARCODE</div>
              )}
              <input type="file" accept="image/*" capture="environment" ref={vinInputRef} onChange={handleVinCapture} className="hidden" />
            </div>
          </div>
        )}

        {/* STEP 2: Position & Condition */}
        {step >= 2 && (
          <div className="mb-8 animate-fade-in border-t pt-6">
            <h3 className="text-xs font-bold text-gray-400 mb-4 tracking-wider uppercase flex justify-between">
              <span>2. Damage Location</span>
              {step > 2 && <button onClick={() => setStep(2)} className="text-blue-500">EDIT</button>}
            </h3>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { id: 'windshield', label: 'FRONT' },
                { id: 'rear_glass', label: 'REAR' },
                { id: 'side_glass', label: 'SIDE' }
              ].map(pos => (
                <button 
                  key={pos.id}
                  onClick={() => setPosition(pos.id as PositionType)}
                  className={`py-3 rounded-lg font-bold text-xs border transition-colors ${position === pos.id ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-500 border-gray-200'}`}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {position && (
              <div className="mt-6 bg-red-50 border border-red-100 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-red-800 text-sm">Glass Missing/Shattered?</h4>
                  <p className="text-xs text-red-600 mt-1">Switch to Forensic Hardware Protocol.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={isShattered} onChange={() => setIsShattered(!isShattered)} />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>
            )}

            {position && step === 2 && (
              <button onClick={() => setStep(3)} className="w-full mt-6 bg-gray-900 text-white font-bold py-4 rounded-lg hover:bg-black transition-colors">
                PROCEED TO PROOFS ➔
              </button>
            )}
          </div>
        )}

        {/* STEP 3: Dynamic Forensic Proofs */}
        {step === 3 && position && (
          <div className="animate-fade-in border-t pt-6">
            <h3 className="text-xs font-bold text-gray-400 mb-4 tracking-wider uppercase">
              3. {isShattered ? 'Forensic Protocol Active' : 'Required Proofs'}
            </h3>

            <div className="flex flex-col gap-3">
              {currentRequirements.map((req) => (
                <div key={req.id} className="border border-gray-100 bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${proofImages[req.id] ? 'bg-green-100' : 'bg-blue-100'}`}>
                      {proofImages[req.id] ? '✅' : req.icon}
                    </div>
                    <div>
                      <span className={`font-bold block text-sm ${proofImages[req.id] ? 'text-green-700' : 'text-gray-800'}`}>
                        {req.label}
                      </span>
                      {proofImages[req.id] && <span className="text-xs text-green-600">Captured securely</span>}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setActiveInstruction(req)}
                    className="bg-white border border-gray-200 px-4 py-2 rounded-md text-xs font-bold text-blue-600 shadow-sm"
                  >
                    {proofImages[req.id] ? 'RETAKE' : 'CAPTURE'}
                  </button>
                </div>
              ))}
            </div>

            <button 
              disabled={!allProofsCaptured}
              onClick={handleFinalUpload}
              className={`w-full mt-8 font-bold py-4 rounded-lg transition-colors ${
                allProofsCaptured ? 'bg-blue-700 text-white hover:bg-blue-800 shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              INITIATE AI DECODE ➔
            </button>
          </div>
        )}
      </div>

      {/* --- LIVE AR CAMERA --- */}
      {activeInstruction && (
        <CustomCamera 
          instructionLabel={activeInstruction.label}
          arabicGuidance={activeInstruction.desc} // We will use your Arabic prompts here later!
          onCapture={(base64Image) => {
            // When the Custom Camera takes the photo, save it and close the camera
            setProofImages(prev => ({ ...prev, [activeInstruction.id]: base64Image }));
            setActiveInstruction(null);
          }}
          onCancel={() => setActiveInstruction(null)}
        />
      )}

    </div>
  );
}