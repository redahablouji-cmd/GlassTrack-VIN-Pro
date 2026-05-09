// src/services/api.ts

/**
 * Sends a live camera frame to the Vercel AI Bouncer to get real-time Arabic guidance.
 */
export const analyzeLiveFrame = async (frameBase64: string, expectedPart: string) => {
  try {
    const response = await fetch('/api/bouncer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: frameBase64, part: expectedPart }),
    });

    if (!response.ok) {
      // Grab the EXACT error text from our Vercel catch block
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data as { isPerfect: boolean; arabicInstruction: string };
    
  } catch (error: any) {
    console.error("Failed to ping AI Bouncer:", error);
    
    // Pass the raw error straight to the CustomCamera.tsx state
    return { 
      isPerfect: false, 
      arabicInstruction: 'تم إيقاف الاتصال', // "Connection Stopped"
      systemError: `Google API Error: ${error.message}` 
    };
  }
};
/**
 * Sends all finalized photos to Gemini 3.1 Pro to extract the Eurocode/NAGS code.
 */
export const decodeVehiclePhotos = async (payload: any) => {
  try {
    const response = await fetch('/api/decoder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Decoding failed");

    return await response.json();
  } catch (error) {
    console.error("Failed to decode:", error);
    throw error;
  }
};