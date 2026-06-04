import { StoryState, CharacterState } from "./types";

export function parseModelResponse(text: string): StoryState {
  let jsonStart = text.lastIndexOf('\`\`\`json');
  let jsonEnd = text.lastIndexOf('\`\`\`');
  let characterStates: CharacterState[] | undefined = undefined;
  let pornstarStats: any = undefined;
  
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const jsonStr = text.substring(jsonStart + 7, jsonEnd).trim();
    try {
      const parsedData = JSON.parse(jsonStr);
      if (parsedData.characters && Array.isArray(parsedData.characters)) {
        characterStates = parsedData.characters;
      }
      if (parsedData.pornstarStats) {
        pornstarStats = parsedData.pornstarStats;
      }
    } catch (e) {
      console.warn("Could not parse character states json:", e);
    }
    // Remove the JSON block from text before we parse lines
    text = text.substring(0, jsonStart).trim();
  } else {
     // Handle case where they didn't write ```json but just { } at the end
     let lastBraceStart = text.lastIndexOf('{');
     let lastBraceEnd = text.lastIndexOf('}');
     if (lastBraceStart !== -1 && lastBraceEnd > lastBraceStart && lastBraceStart > text.length - 1000) {
         try {
           const jsonStr = text.substring(lastBraceStart, lastBraceEnd + 1);
           const parsedData = JSON.parse(jsonStr);
           if (parsedData.characters && Array.isArray(parsedData.characters)) {
               characterStates = parsedData.characters;
           }
           if (parsedData.pornstarStats) {
               pornstarStats = parsedData.pornstarStats;
           }
           if (characterStates || pornstarStats) {
               text = text.substring(0, lastBraceStart).trim();
           }
         } catch (e) {
         }
     }
  }

  const lines = text.split('\n');
  const paragraphs: string[] = [];
  const options: { id: string, num: string, text: string }[] = [];
  
  let currentPara = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines like "[1] Some option text"
    const optionMatch = trimmed.match(/^\[(\d+)\]\s*(.*)/);
    
    if (optionMatch) {
      if (currentPara.trim() && currentPara.trim().toLowerCase() !== "what happens next?") {
         paragraphs.push(currentPara.trim());
      }
      currentPara = "";
      options.push({ id: optionMatch[1], num: optionMatch[1], text: optionMatch[2] });
    } else {
      if (trimmed.toLowerCase() === "what happens next?") {
         if (currentPara.trim()) {
             paragraphs.push(currentPara.trim());
         }
         currentPara = "";
      } else if (trimmed === "") {
         if (currentPara.trim()) {
             paragraphs.push(currentPara.trim());
             currentPara = "";
         }
      } else {
         currentPara += trimmed + " ";
      }
    }
  }
  
  if (currentPara.trim()) {
    paragraphs.push(currentPara.trim());
  }
  
  return { paragraphs, options, characterStates, pornstarStats };
}

