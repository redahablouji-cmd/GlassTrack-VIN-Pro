import React, { useEffect, useRef, useState } from 'react';
import { analyzeLiveFrame } from '../services/api';

interface CustomCameraProps {
  instructionLabel: string;
  expectedPart: string; // Tells the AI what it should be looking for
  onCapture: (base64Image: string) => void;
  onCancel: () => void;
}

export default function CustomCamera({ instructionLabel, expectedPart, onCapture, onCancel }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [isAngleCorrect, setIsAngleCorrect] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState('جاري تحليل الصورة... يرجى توجيه الكاميرا'); // "Analyzing image... please point camera"
  const [isProcessingPulse, setIsProcessingPulse] = useState(false);

  // 1. Start the Video Feed
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
        }
      } catch (err) {
        alert("Camera permission denied.");
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

  // 2. The AI Pulse (Continuous Frame Sampling)
  useEffect(() => {
    if (!isReady || isAngleCorrect) return;

    const pulseInterval = setInterval(async () => {
      if (isProcessingPulse) return; // Wait if the previous AI check is still running
      
      if (videoRef.current && canvasRef.current) {
        setIsProcessingPulse(true);
        
        // Grab a silent frame
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameBase64 = canvas.toDataURL('image/jpeg', 0.5); // Lower quality for faster AI pulse

          try {
            // === THIS IS WHERE IT HITS YOUR REAL AI ===
            // We are calling a function from your api.ts file
            const aiResponse = await analyzeLiveFrame(frameBase64, expectedPart);
            
            if (aiResponse.isPerfect) {
              setIsAngleCorrect(true);
              setLiveFeedback('✅ الزاوية صحيحة، التقط الصورة الآن'); // "Angle correct, capture now"
              clearInterval(pulseInterval); // Stop pulsing once we have the green light
            } else {
              // Update the screen with whatever the AI told them to do
              setLiveFeedback(aiResponse.arabicInstruction);
            }
          } catch (error) {
            console.error("AI Pulse failed", error);
          } finally {
            setIsProcessingPulse(false);
          }
        }
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(pulseInterval);
  }, [isReady, isAngleCorrect, isProcessingPulse, expectedPart]);

  // 3. The Final High-Res Capture
  const takePhoto = () => {
    if (videoRef.current && canvasRef.current && isAngleCorrect) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const highResBase64 = canvas.toDataURL('image/jpeg', 0.9);
        onCapture(highResBase64); 
      }
    }
  };

  // Mock function representing your api.ts call
  // We will replace this with your actual Gemini API connection next!
  const analyzeLiveFrame = async (frame: string, part: string) => {
    return new Promise<{isPerfect: boolean, arabicInstruction: string}>((resolve) => {
      // For now, it will tell you it's wrong for 4 seconds, then turn green, just to show the text changing.
      setTimeout(() => {
        const randomFailures = [
          "الصورة قريبة جداً، ارجع للخلف" , // "Too close, step back"
          "لا يمكن رؤية الزجاج بشكل كامل", // "Cannot see the glass fully"
          "الرجاء إمالة الهاتف قليلاً" // "Please tilt the phone slightly"
        ];
        resolve({
          isPerfect: Math.random() > 0.7, 
          arabicInstruction: randomFailures[Math.floor(Math.random() * randomFailures.length)]
        });
      }, 500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <button onClick={onCancel} className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full">✕ إغلاق</button>
        <span className="text-white font-bold tracking-wider text-sm uppercase bg-black/50 px-3 py-1 rounded">{instructionLabel}</span>
      </div>

      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 z-10">
        <div className={`w-full max-w-sm aspect-[4/3] border-4 transition-colors duration-300 rounded-2xl relative ${
          isAngleCorrect ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'
        }`} />

        <div className="mt-8 bg-black/80 backdrop-blur-md px-6 py-4 rounded-xl text-center border border-white/20 shadow-2xl max-w-xs">
          <p className={`font-bold text-lg dir-rtl ${isAngleCorrect ? 'text-green-400' : 'text-white'}`}>
            {liveFeedback}
          </p>
        </div>
      </div>

      <div className="absolute bottom-0 w-full pb-12 pt-6 flex justify-center items-center z-20 bg-gradient-to-t from-black via-black/50 to-transparent">
        <button 
          onClick={takePhoto}
          disabled={!isAngleCorrect}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
            isAngleCorrect ? 'border-green-500 bg-green-500/20 active:scale-95' : 'border-gray-500 bg-gray-500/20 opacity-50'
          }`}
        >
          <div className={`w-14 h-14 rounded-full ${isAngleCorrect ? 'bg-white' : 'bg-gray-400'}`} />
        </button>
      </div>
    </div>
  );
}