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

    // Parse the error if the response is not OK (e.g., Status 429 or 500)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP Error ${response.status}`);
    }

    const data = await response.json();
    return data as { isPerfect: boolean; arabicInstruction: string };
    
  } catch (error: any) {
    console.error("Failed to ping AI Bouncer:", error);
    // We now return the EXACT error message so the UI can display it
    return { 
      isPerfect: false, 
      arabicInstruction: 'خطأ في الاتصال', // "Connection Error"
      systemError: error.message // Passing the raw error string up to the camera
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