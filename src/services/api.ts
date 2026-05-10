// src/services/api.ts

/**
 * Sends a live camera frame to the Vercel AI Bouncer to get real-time Arabic guidance.
 */
export const analyzeLiveFrame = async (image: string, part: string) => {
  try {
    const response = await fetch('/api/bouncer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, part })
    });

    // If Vercel throws a 500 or 413, this forces the app to grab the exact text
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vercel Error ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || "Failed to reach the server. Check your connection.");
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