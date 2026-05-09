import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Explicitly using the Flash model for the live camera pulse
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a live, highly intelligent Auto Glass Expert supervisor watching a technician's camera feed in real-time.
    The technician is trying to photograph the: "${part}".
    
    Look carefully at the provided image. Act like a human supervisor talking directly to the technician through an earpiece. 
    
    If the image is wrong, tell them EXACTLY what you see in the frame and how to correct it. Speak in natural, conversational Arabic. Do not use generic, pre-programmed responses. Be dynamic and highly specific to the photo.
    
    Respond ONLY with a valid JSON object in this format:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If true, reply with '✅ زاوية ممتازة، التقط الصورة الآن!'. If false, give your dynamic, live Arabic feedback. (Examples of how you should talk: 'أنا أرى سقف السيارة فقط، يرجى خفض الكاميرا قليلاً لتصوير المرآة' [I only see the car roof, please lower the camera a bit to capture the mirror] OR 'الضوء يعكس بشدة على الزجاج ولا يمكنني قراءة الختم، حاول تغيير زاويتك' [The light is reflecting heavily on the glass and I cannot read the stamp, try changing your angle])."
    }`;

    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);
    
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("AI Bouncer Error:", error);
    // Force the exact Google error message to be sent to the frontend
    const errorMessage = error?.message || error?.toString() || "Unknown AI Error";
    return res.status(500).json({ error: errorMessage });
  }
}
