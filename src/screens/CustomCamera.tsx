import React, { useEffect, useRef, useState } from 'react';
// Import the live Edge AI models
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
// Import your Gemini Bouncer from the api.ts file we made earlier
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
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  
  const [isCarDetected, setIsCarDetected] = useState(false);
  const [isAngleCorrect, setIsAngleCorrect] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState('جاري تحميل الذكاء الاصطناعي الكاميرا...'); // "Loading Camera AI..."
  const [isCheckingGemini, setIsCheckingGemini] = useState(false);

  // 1. Start Camera AND Load the Live AI into the phone
  useEffect(() => {
    const setupAIAndCamera = async () => {
      try {
        // Load TensorFlow Object Detection Model
        await tf.ready();
        const loadedModel = await cocoSsd.load();
        setModel(loadedModel);
        setLiveFeedback('ابحث عن السيارة...'); // "Look for a car..."

        // Start the Camera
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
        }
      } catch (err) {
        console.error(err);
        setLiveFeedback('فشل الوصول للكاميرا'); // "Camera access failed"
      }
    };
    setupAIAndCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  // 2. The Live AI Loop (Runs at 30 Frames Per Second inside the browser)
  useEffect(() => {
    if (!isReady || !model || !videoRef.current || isAngleCorrect) return;

    let animationFrameId: number;

    const detectLiveObjects = async () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
        // AI scans the live video feed
        const predictions = await model.detect(videoRef.current);
        
        // Is there a car or truck in the frame?
        const foundCar = predictions.some(p => p.class === 'car' || p.class === 'truck');
        
        setIsCarDetected(foundCar);

        if (!foundCar) {
          setLiveFeedback('لا توجد سيارة في الإطار'); // "No car in frame" - IT WILL FAIL IF IN YOUR OFFICE!
        } else if (!isCheckingGemini) {
          setLiveFeedback('تم العثور على سيارة. جاري فحص الزاوية...'); // "Car found. Checking angle..."
        }
      }
      // Loop this forever until we get the perfect shot
      animationFrameId = requestAnimationFrame(detectLiveObjects);
    };

    detectLiveObjects();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isReady, model, isCheckingGemini, isAngleCorrect]);

  // 3. The Gemini Pulse (Only runs IF a car is detected)
  useEffect(() => {
    if (!isCarDetected || isAngleCorrect || isCheckingGemini) return;

    const pulseInterval = setInterval(async () => {
      if (videoRef.current && canvasRef.current) {
        setIsCheckingGemini(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameBase64 = canvas.toDataURL('image/jpeg', 0.5);

          try {
            // Send to Gemini HQ (from your api.ts file)
            const aiResponse = await analyzeLiveFrame(frameBase64, expectedPart);
            
            if (aiResponse.isPerfect) {
              setIsAngleCorrect(true);
              setLiveFeedback('✅ الزاوية صحيحة، التقط الصورة الآن'); // "Angle correct, capture now"
              clearInterval(pulseInterval); 
            } else {
              setLiveFeedback(aiResponse.arabicInstruction); // "Tilt down", "Step back", etc.
            }
          } catch (error) {
             console.error("Gemini Check Failed", error);
          } finally {
            setIsCheckingGemini(false);
          }
        }
      }
    }, 2500); // Pulse every 2.5 seconds to save API costs

    return () => clearInterval(pulseInterval);
  }, [isCarDetected, isAngleCorrect, isCheckingGemini, expectedPart]);

  // 4. Capture Final Image
  const takePhoto = () => {
    if (videoRef.current && canvasRef.current && isAngleCorrect) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCapture(canvas.toDataURL('image/jpeg', 0.9)); 
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <button onClick={onCancel} className="text-white font-bold text-sm bg-red-600 px-4 py-2 rounded-full">✕ إغلاق</button>
        <span className="text-white font-bold text-sm bg-black/50 px-3 py-1 rounded">{instructionLabel}</span>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 z-10">
        <div className={`w-full max-w-sm aspect-[4/3] border-4 transition-colors duration-300 rounded-2xl relative ${
          !isCarDetected ? 'border-red-600 bg-red-600/10' : 
          isAngleCorrect ? 'border-green-500 bg-green-500/10' : 'border-yellow-400 bg-yellow-400/10'
        }`} />

        <div className="mt-8 bg-black/80 backdrop-blur-md px-6 py-4 rounded-xl text-center border border-white/20">
          <p className={`font-bold text-lg dir-rtl ${
            !isCarDetected ? 'text-red-500' : 
            isAngleCorrect ? 'text-green-400' : 'text-yellow-400'
          }`}>
            {liveFeedback}
          </p>
        </div>
      </div>

      <div className="absolute bottom-0 w-full pb-12 pt-6 flex justify-center items-center z-20 bg-gradient-to-t from-black via-black/50 to-transparent">
        <button 
          onClick={takePhoto}
          disabled={!isAngleCorrect}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
            isAngleCorrect ? 'border-green-500 bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'border-gray-500 bg-gray-500/20 opacity-40'
          }`}
        >
          <div className={`w-14 h-14 rounded-full ${isAngleCorrect ? 'bg-white' : 'bg-gray-400'}`} />
        </button>
      </div>
    </div>
  );
}