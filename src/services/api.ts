// src/services/api.ts

/**
 * Sends a live camera frame to the Vercel AI Bouncer to get real-time Arabic guidance.
 */
export const analyzeLiveFrame = async (frameBase64: string, expectedPart: string) => {
  try {
    const response = await fetch('/api/bouncer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: frameBase64,
        part: expectedPart,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();
    return data as { isPerfect: boolean; arabicInstruction: string };
    
  } catch (error) {
    console.error("Failed to ping AI Bouncer:", error);
    // Fallback if the network drops temporarily
    return { 
      isPerfect: false, 
      arabicInstruction: 'جارٍ إعادة الاتصال بالذكاء الاصطناعي...' // "Reconnecting to AI..."
    };
  }
};