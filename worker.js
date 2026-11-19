// Cloudflare Worker: secure Gemini API proxy for Manas College Review App.
// Set GEMINI_API_KEY as a Worker Secret. Never put the key in index.html or GitHub.
const MODEL = "gemini-3.8-flash";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};
function reply(body, status=200) {
  return new Response(JSON.stringify(body), {status, headers:cors});
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, {headers:cors});
    if (request.method !== "POST") return reply({error:"Use POST."},405);
    if (!env.GEMINI_API_KEY) return reply({error:"Server API key is not configured. Add GEMINI_API_KEY as a Worker Secret."},500);
    let input;
    try { input = await request.json(); } catch { return reply({error:"Invalid JSON request."},400); }
    const language = input.language === "hi" ? "Hindi" : "English";
    const rating = Math.max(1,Math.min(5,Number(input.rating)||5));
    const keywords = Array.isArray(input.keywords) ? input.keywords.map(x=>String(x).slice(0,80)).slice(0,12) : [];
    const detail = String(input.detail||"").slice(0,500);
    if (!keywords.length) return reply({error:"Please provide at least one keyword."},400);
    const prompt = `Write one natural, concise Google review draft for Manas College in ${language}.
Use ONLY the student's supplied facts and keywords; do not invent facilities, outcomes, events, staff names, or personal experiences.
Keywords: ${keywords.join(", ")}
Additional detail supplied by the reviewer: ${detail || "None"}
Selected star rating: ${rating}/5.
Reflect the rating honestly; do not turn a low rating into praise or pressure the reviewer to be positive.
Write in first person only as a draft for the user to verify and edit. Avoid generic exaggerated claims, hashtags, headings, quotation marks, and claims not supported by the input. Return only the review text.`;
    try {
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:"You help users express their own genuine feedback. Never fabricate personal experience or facts."}]},
          contents:[{role:"user",parts:[{text:prompt}]}],
          generationConfig:{temperature:0.8,maxOutputTokens:220}
        })
      });
      const data = await upstream.json();
      if (!upstream.ok) return reply({error:data?.error?.message || `Gemini API error (${upstream.status}). Check key, model access, and quota.`},502);
      const review = (data.candidates||[]).flatMap(c=>c.content?.parts||[]).map(p=>p.text||"").join("").trim();
      if (!review) return reply({error:"Gemini did not return review text. Try again."},502);
      return reply({review});
    } catch (e) {
      return reply({error:"Could not connect to Gemini API. Please try again."},502);
    }
  }
};
