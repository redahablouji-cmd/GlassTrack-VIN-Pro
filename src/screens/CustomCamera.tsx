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
  const [isAngleCorrect, setIsAngleCorrect] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState('جاري تجهيز كاميرا الذكاء الاصطناعي...'); 
  const [isPulsing, setIsPulsing] = useState(false);
  
  // NEW: The state for our live Debug Console
  const [systemError, setSystemError] = useState<string | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
          setLiveFeedback('وجه الكاميرا نحو الجزء المطلوب'); 
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

  useEffect(() => {
    if (!isReady || isAngleCorrect) return;

    const pulseInterval = setInterval(async () => {
      if (isPulsing || !videoRef.current || !canvasRef.current) return;
      
      setIsPulsing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = 400; 
      canvas.height = (400 * video.videoHeight) / video.videoWidth;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameBase64 = canvas.toDataURL('image/jpeg', 0.4);

        try {
          // Send to Bouncer
          const aiResponse: any = await analyzeLiveFrame(frameBase64, expectedPart);
          
          // NEW: Catch and display the raw system error from Vercel/Gemini
          if (aiResponse.systemError) {
            setSystemError(aiResponse.systemError);
          } else {
            setSystemError(null); // Clear errors if it connects successfully
          }

          if (aiResponse.isPerfect) {
            setIsAngleCorrect(true);
            setLiveFeedback('✅ الزاوية صحيحة، التقط الصورة الآن'); 
            clearInterval(pulseInterval); 
          } else {
            setLiveFeedback(aiResponse.arabicInstruction); 
          }
        } catch (error) {
          setSystemError("Local Network Error");
        } finally {
          setIsPulsing(false);
        }
      }
    // CHANGED: 4500ms (4.5 seconds). This equals ~13 requests per minute. 
    // This safely keeps you under the 15 RPM Google Free Tier limit!
    }, 4500); 

    return () => clearInterval(pulseInterval);
  }, [isReady, isAngleCorrect, isPulsing, expectedPart]);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current && isAngleCorrect) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCapture(canvas.toDataURL('image/jpeg', 0.9)); 
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

      {/* NEW: LIVE DEBUG CONSOLE */}
      {systemError && (
        <div className="absolute top-20 w-full px-4 z-30">
          <div className="bg-red-900/90 border border-red-500 rounded-lg p-3 shadow-2xl">
            <h4 className="text-red-300 text-xs font-bold uppercase mb-1">Live Terminal Error</h4>
            <p className="text-white text-sm font-mono break-words">{systemError}</p>
          </div>
        </div>
      )}

      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 z-10">
        <div className={`w-full max-w-sm aspect-[4/3] border-4 transition-colors duration-300 rounded-2xl relative ${
          isAngleCorrect ? 'border-green-500 bg-green-500/10' : 'border-blue-500 bg-blue-500/10'
        }`} />

        <div className="mt-8 bg-black/80 backdrop-blur-md px-6 py-4 rounded-xl text-center border border-white/20">
          <p className={`font-bold text-lg dir-rtl ${isAngleCorrect ? 'text-green-400' : 'text-blue-300'}`}>
            {liveFeedback}
          </p>
        </div>
      </div>

      <div className="absolute bottom-0 w-full pb-12 pt-6 flex justify-center items-center z-20 bg-gradient-to-t from-black via-black/50 to-transparent">
        <button 
          onClick={takePhoto}
          disabled={!isAngleCorrect}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
            isAngleCorrect ? 'border-green-500 bg-green-500/20' : 'border-gray-500 bg-gray-500/20 opacity-40'
          }`}
        >
          <div className={`w-14 h-14 rounded-full ${isAngleCorrect ? 'bg-white' : 'bg-gray-400'}`} />
        </button>
      </div>
    </div>
  );
}