import React, { useEffect, useRef, useState } from 'react';
import { analyzeLiveFrame } from '../services/api';

interface CustomCameraProps {
  instructionLabel: string;
  expectedPart: string;
  onCapture: (base64Image: string) => void;
  onCancel: () => void;
}

export default function CustomCamera({ instructionLabel, expectedPart, onCapture, onCancel }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [isValidating, setIsValidating] = useState(false); // NEW: Tracks if we are waiting for the AI
  const [liveFeedback, setLiveFeedback] = useState('وجه الكاميرا والتقط الصورة'); // "Point camera and take photo"
  const [systemError, setSystemError] = useState<string | null>(null);

  // 1. Start the Camera (No AI pulsing here anymore!)
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
        }
      } catch (err) {
        setLiveFeedback('خطأ: لا يمكن الوصول للكاميرا');
      }
    };
    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  // 2. The Manual Capture & AI Validation
  const handleManualCapture = async () => {
    if (!videoRef.current || !canvasRef.current || isValidating) return;

    // Freeze UI and show loading state
    setIsValidating(true);
    setLiveFeedback('جاري فحص الصورة بالذكاء الاصطناعي...'); // "Analyzing photo with AI..."
    setSystemError(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Capture a high-quality frame for the AI to check
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const highResBase64 = canvas.toDataURL('image/jpeg', 0.8); // Good quality for analysis

      try {
        // Send ONE request to the Bouncer
        const aiResponse: any = await analyzeLiveFrame(highResBase64, expectedPart);

        if (aiResponse.systemError) {
          setSystemError(aiResponse.systemError);
          setLiveFeedback('حدث خطأ، يرجى المحاولة مرة أخرى');
          setIsValidating(false);
          return;
        }

        if (aiResponse.isPerfect) {
          setLiveFeedback('✅ صورة ممتازة!');
          // Wait half a second so they see the success message, then save and close
          setTimeout(() => {
            onCapture(highResBase64);
          }, 500);
        } else {
          // AI rejected it. Show the Arabic instruction and let them try again.
          setLiveFeedback(`❌ ${aiResponse.arabicInstruction}`);
          setIsValidating(false); // Unfreeze the button so they can retake
        }
      } catch (error) {
        setSystemError("Local Network Error");
        setIsValidating(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Top Navigation */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <button onClick={onCancel} className="text-white font-bold text-sm bg-red-600 px-4 py-2 rounded-full">✕ إغلاق</button>
        <span className="text-white font-bold text-xs bg-black/50 px-3 py-1 rounded tracking-wider">{instructionLabel}</span>
      </div>

      {/* Debug Console */}
      {systemError && (
        <div className="absolute top-20 w-full px-4 z-30">
          <div className="bg-red-900/90 border border-red-500 rounded-lg p-3 shadow-2xl">
            <h4 className="text-red-300 text-xs font-bold uppercase mb-1">Live Terminal Error</h4>
            <p className="text-white text-sm font-mono break-words">{systemError}</p>
          </div>
        </div>
      )}

      {/* Camera Feed */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        // Darken the video slightly while validating so it feels like it's processing
        className={`w-full h-full object-cover transition-opacity ${isValidating ? 'opacity-50' : 'opacity-100'}`} 
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* AR Overlay Box */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 z-10">
        <div className={`w-full max-w-sm aspect-[4/3] border-4 transition-colors duration-300 rounded-2xl relative ${
          isValidating ? 'border-yellow-400 bg-yellow-400/10 animate-pulse' : 'border-blue-500 bg-blue-500/10'
        }`} />

        <div className="mt-8 bg-black/80 backdrop-blur-md px-6 py-4 rounded-xl text-center border border-white/20">
          <p className={`font-bold text-lg dir-rtl ${isValidating ? 'text-yellow-400' : 'text-blue-300'}`}>
            {liveFeedback}
          </p>
        </div>
      </div>

      {/* Capture Button */}
      <div className="absolute bottom-0 w-full pb-12 pt-6 flex justify-center items-center z-20 bg-gradient-to-t from-black via-black/50 to-transparent">
        <button 
          onClick={handleManualCapture}
          disabled={isValidating || !isReady}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
            isValidating ? 'border-gray-500 bg-gray-500/20 cursor-wait' : 'border-white bg-white/20 active:scale-95'
          }`}
        >
          {isValidating ? (
            // Simple loading spinner inside the button
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-white" />
          )}
        </button>
      </div>
    </div>
  );
}