import axios from 'axios';

// Delad mellan svenska-kyrkan-ingestion.ts och dethander-ingestion.ts (båda
// hämtar från en färdig, strukturerad källa istället för att AI-parsa fri
// text som index.ts:callAI gör). Godkänt designbeslut från DEL 1 (se
// del1-source-adapter-design-minnet): beskrivningen får ALDRIG sparas
// ordagrant av juridiska skäl, oavsett hur strukturerad källan är — så till
// skillnad från title/start/location (redan strukturerade, inte
// upphovsrättskänsliga) måste description alltid gå genom en AI-omskrivning.
// Misslyckas det (ingen nyckel, AI-fel) returneras null och eventet HOPPAS
// ÖVER — att falla tillbaka på originaltexten hade varit exakt det beslutet
// förbjuder. En tom originalbeskrivning har dock inget ordagrant att skydda,
// så den får passera direkt utan AI-anrop.
export async function rewriteDescription(title: string, rawDescription: string): Promise<string | null> {
  if (!rawDescription.trim()) return '';

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Skriv om följande evenemangsbeskrivning med egna ord på svenska, max 2 meningar. Återge INTE originaltexten ordagrant.

Titel: ${title}
Originalbeskrivning: ${rawDescription.substring(0, 500)}

Svara ENDAST med den omskrivna texten, ingen extra formatering eller citattecken.`;

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: prompt }] },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
      const content = response.data.content[0];
      return content.type === 'text' ? content.text.trim() : null;
    } else {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3 },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );
      const text = response.data.choices[0]?.message?.content;
      return typeof text === 'string' ? text.trim() : null;
    }
  } catch (error) {
    console.error('rewriteDescription misslyckades:', error);
    return null;
  }
}
