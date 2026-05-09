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
  const [liveFeedback, setLiveFeedback] = useState('جاري تجهيز كاميرا الذكاء الاصطناعي...'); // "Initializing AI Camera..."
  const [isPulsing, setIsPulsing] = useState(false);

  // 1. Start the Raw Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
          setLiveFeedback('وجه الكاميرا نحو الجزء المطلوب'); // "Point camera at the required part"
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

  // 2. The Gemini Flash "Pulse" Loop
  useEffect(() => {
    // Only pulse if camera is ready, and stop pulsing if the angle is perfect
    if (!isReady || isAngleCorrect) return;

    const pulseInterval = setInterval(async () => {
      // Don't send a new frame if the previous one is still processing
      if (isPulsing || !videoRef.current || !canvasRef.current) return;
      
      setIsPulsing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // We shrink the frame size here to make the API call lightning fast
      canvas.width = 400; 
      canvas.height = (400 * video.videoHeight) / video.videoWidth;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Heavily compress the image (quality 0.4) because Flash doesn't need 4K to see an angle
        const frameBase64 = canvas.toDataURL('image/jpeg', 0.4);

        try {
          // Send to your Vercel Bouncer (Gemini Flash)
          const aiResponse = await analyzeLiveFrame(frameBase64, expectedPart);
          
          if (aiResponse.isPerfect) {
            setIsAngleCorrect(true);
            setLiveFeedback('✅ الزاوية صحيحة، التقط الصورة الآن'); 
            clearInterval(pulseInterval); 
          } else {
            setLiveFeedback(aiResponse.arabicInstruction); 
          }
        } catch (error) {
          console.error("Pulse error:", error);
        } finally {
          setIsPulsing(false);
        }
      }
    }, 1500); // Pulse every 1.5 seconds

    return () => clearInterval(pulseInterval);
  }, [isReady, isAngleCorrect, isPulsing, expectedPart]);

  // 3. The Final High-Resolution Capture
  const takePhoto = () => {
    if (videoRef.current && canvasRef.current && isAngleCorrect) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Reset canvas to full device resolution for the final, perfect shot
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // This is the beautiful, high-res photo that gets saved to send to Gemini PRO later
        onCapture(canvas.toDataURL('image/jpeg', 0.9)); 
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <button onClick={onCancel} className="text-white font-bold text-sm bg-red-600 px-4 py-2 rounded-full">✕ إغلاق</button>
        <span className="text-white font-bold text-xs bg-black/50 px-3 py-1 rounded tracking-wider">{instructionLabel}</span>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 z-10">
        <div className={`w-full max-w-sm aspect-[4/3] border-4 transition-colors duration-300 rounded-2xl relative ${
          isAngleCorrect ? 'border-green-500 bg-green-500/10 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : 'border-blue-500 bg-blue-500/10'
        }`} />

        <div className="mt-8 bg-black/80 backdrop-blur-md px-6 py-4 rounded-xl text-center border border-white/20 shadow-2xl">
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
            isAngleCorrect ? 'border-green-500 bg-green-500/20 active:scale-95' : 'border-gray-500 bg-gray-500/20 opacity-40'
          }`}
        >
          <div className={`w-14 h-14 rounded-full ${isAngleCorrect ? 'bg-white' : 'bg-gray-400'}`} />
        </button>
      </div>
    </div>
  );
}