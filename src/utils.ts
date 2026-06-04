import { StoryState, CharacterState } from "./types";

export function parseModelResponse(text: string): StoryState {
  let characterStates: CharacterState[] | undefined = undefined;
  let pornstarStats: any = undefined;
  let cleanedText = text;

  // Try <STATE> ... </STATE> format first (used by mock provider)
  const stateMatch = text.match(/<STATE>\s*([\s\S]*?)\s*<\/STATE>/i);
  if (stateMatch) {
    try {
      const parsedData = JSON.parse(stateMatch[1].trim());
      if (parsedData.characterStates && Array.isArray(parsedData.characterStates)) {
        characterStates = parsedData.characterStates;
      } else if (parsedData.characters && Array.isArray(parsedData.characters)) {
        characterStates = parsedData.characters;
      }
      if (parsedData.pornstarStats) {
        pornstarStats = parsedData.pornstarStats;
      }
      cleanedText = text.replace(/<STATE>[\s\S]*?<\/STATE>/i, '').trim();
    } catch (e) {
      console.warn("Could not parse <STATE> json:", e);
    }
  } else {
    // Try ```json block (used by main Gemini/OpenRouter prompt)
    let jsonStart = text.lastIndexOf('```json');
    let jsonEnd = text.lastIndexOf('```');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = text.substring(jsonStart + 7, jsonEnd).trim();
      try {
        const parsedData = JSON.parse(jsonStr);
        if (parsedData.characters && Array.isArray(parsedData.characters)) {
          characterStates = parsedData.characters;
        } else if (parsedData.characterStates && Array.isArray(parsedData.characterStates)) {
          characterStates = parsedData.characterStates;
        }
        if (parsedData.pornstarStats) {
          pornstarStats = parsedData.pornstarStats;
        }
      } catch (e) {
        console.warn("Could not parse ```json block:", e);
      }
      cleanedText = text.substring(0, jsonStart).trim();
    } else {
      // Fallback: look for trailing JSON object near the end
      let lastBraceStart = text.lastIndexOf('{');
      let lastBraceEnd = text.lastIndexOf('}');
      if (lastBraceStart !== -1 && lastBraceEnd > lastBraceStart && lastBraceStart > text.length - 1500) {
        try {
          const jsonStr = text.substring(lastBraceStart, lastBraceEnd + 1);
          const parsedData = JSON.parse(jsonStr);
          if (parsedData.characters && Array.isArray(parsedData.characters)) {
            characterStates = parsedData.characters;
          } else if (parsedData.characterStates && Array.isArray(parsedData.characterStates)) {
            characterStates = parsedData.characterStates;
          }
          if (parsedData.pornstarStats) {
            pornstarStats = parsedData.pornstarStats;
          }
          if (characterStates || pornstarStats) {
            cleanedText = text.substring(0, lastBraceStart).trim();
          }
        } catch (e) {
          // ignore parse errors in fallback
        }
      }
    }
  }

  // Parse paragraphs and options from the cleaned narrative text
  const lines = cleanedText.split('\n');
  const paragraphs: string[] = [];
  const options: { id: string, num: string, text: string }[] = [];
  
  let currentPara = "";
  let inOptionsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentPara.trim()) {
        paragraphs.push(currentPara.trim());
        currentPara = "";
      }
      continue;
    }

    if (trimmed.toLowerCase() === "what happens next?") {
      if (currentPara.trim()) {
        paragraphs.push(currentPara.trim());
      }
      currentPara = "";
      continue;
    }

    // Support both [1] text and 1. text and 1) text formats
    const bracketMatch = trimmed.match(/^\[(\d+)\]\s*(.*)/);
    const numberedMatch = trimmed.match(/^(\d+)[\.)]\s*(.*)/);
    
    if (bracketMatch || numberedMatch) {
      const match = bracketMatch || numberedMatch;
      if (currentPara.trim() && currentPara.trim().toLowerCase() !== "what happens next?") {
        paragraphs.push(currentPara.trim());
      }
      currentPara = "";
      const numStr = match![1];
      const optionText = (match![2] || '').trim();
      options.push({ id: numStr, num: numStr, text: optionText });
      inOptionsSection = true;
      continue;
    }

    if (trimmed.toUpperCase() === '[OPTIONS]') {
      inOptionsSection = true;
      if (currentPara.trim()) {
        paragraphs.push(currentPara.trim());
        currentPara = "";
      }
      continue;
    }

    // Accumulate narrative text (only if not deep in options section)
    if (!inOptionsSection) {
      currentPara += trimmed + " ";
    }
  }
  
  if (currentPara.trim()) {
    paragraphs.push(currentPara.trim());
  }
  
  return { paragraphs, options, characterStates, pornstarStats };
}
