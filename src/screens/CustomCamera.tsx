import React, { useEffect, useRef, useState } from 'react';

// Props to tell the camera what we are looking for
interface CustomCameraProps {
  instructionLabel: string;
  arabicGuidance: string;
  onCapture: (base64Image: string) => void;
  onCancel: () => void;
}

export default function CustomCamera({ instructionLabel, arabicGuidance, onCapture, onCancel }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isReady, setIsReady] = useState(false);
  
  // This simulates the Gyroscope/AI check. 
  // In reality, you hook this up to the window.addEventListener('deviceorientation')
  const [isAngleCorrect, setIsAngleCorrect] = useState(false);

  useEffect(() => {
    // 1. Request raw camera access from the user's browser
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } // Forces the back camera
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
        }
      } catch (err) {
        console.error("Camera access denied or failed:", err);
        alert("Camera permission is required to use the AR Guide.");
      }
    };

    startCamera();

    // Cleanup: Turn off the camera when we close this view
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  // 2. Simulate the AI / Gyroscope checking the angle
  // (Moves from Red to Green after 3 seconds for this demo)
  useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => setIsAngleCorrect(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  // 3. Capture the exact frame from the video feed
  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas to match video resolution
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Convert to Base64 to send to our AI Bouncer
        const base64Image = canvas.toDataURL('image/jpeg', 0.9);
        
        // At this exact moment, you would send base64Image to your Fast AI Bouncer.
        // If it returns "Approved", you call onCapture().
        // If it returns "Blurry", you show an Arabic alert and don't call onCapture().
        onCapture(base64Image); 
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      
      {/* Top Bar */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onCancel} className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full">
          ✕ إغلاق (Close)
        </button>
        <span className="text-white font-bold tracking-wider text-sm uppercase">{instructionLabel}</span>
      </div>

      {/* The Live Video Feed */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="w-full h-full object-cover"
      />

      {/* Hidden Canvas for capturing the image */}
      <canvas ref={canvasRef} className="hidden" />

      {/* AR Overlay (The Ghost Box & Red/Green Borders) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 z-10">
        
        {/* The target box that changes color */}
        <div className={`w-full max-w-sm aspect-[4/3] border-4 transition-colors duration-300 rounded-2xl relative ${
          isAngleCorrect ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'
        }`}>
          {/* Crosshairs to look techy */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 border border-white/50 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Live Arabic AI Guidance */}
        <div className="mt-8 bg-black/70 backdrop-blur-md px-6 py-3 rounded-full text-center border border-white/10">
          <p className={`font-bold text-lg dir-rtl ${isAngleCorrect ? 'text-green-400' : 'text-red-400'}`}>
            {isAngleCorrect ? '✅ الزاوية صحيحة، التقط الصورة الآن' : arabicGuidance}
          </p>
          <p className="text-gray-300 text-xs mt-1">
            {isAngleCorrect ? 'Angle correct, capture now.' : 'Adjusting positioning...'}
          </p>
        </div>

      </div>

      {/* Bottom Capture Button Bar */}
      <div className="absolute bottom-0 w-full pb-12 pt-6 flex justify-center items-center z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <button 
          onClick={takePhoto}
          disabled={!isAngleCorrect}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
            isAngleCorrect ? 'border-green-500 bg-green-500/20 active:bg-green-500' : 'border-gray-500 bg-gray-500/20 opacity-50 cursor-not-allowed'
          }`}
        >
          <div className={`w-14 h-14 rounded-full ${isAngleCorrect ? 'bg-white' : 'bg-gray-400'}`}></div>
        </button>
      </div>

    </div>
  );
}