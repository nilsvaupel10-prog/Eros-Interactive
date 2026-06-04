import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Loader2, Play, Users, Plus, X, Brain, Save, History, Settings, Trash2, HelpCircle, Sliders, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, StoryState, CharacterDefinition, GameMode, CharacterState, SaveSlot } from './types';
import { parseModelResponse } from './utils';
import { defaultCharacters } from './defaultData';
import { defaultScenarios, ScenarioPreset } from './scenariosData';

// Firebase Integrations
import { db, auth, googleProvider, handleFirestoreError, OperationType, testConnection } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  
  // Setup State
  const [availableCharacters, setAvailableCharacters] = useState<CharacterDefinition[]>(defaultCharacters);
  const [activeCharacterIds, setActiveCharacterIds] = useState<string[]>(defaultCharacters.map(c => c.id));
  const [playerCharacterId, setPlayerCharacterId] = useState<string>('3rd_person');
  const [gameMode, setGameMode] = useState<GameMode>('standard');
  const [scenarioInput, setScenarioInput] = useState(defaultScenarios[0].fullSetup);
  const [selectedScenarioPresetId, setSelectedScenarioPresetId] = useState<string>(defaultScenarios[0].id);
  
  // API provider state
  const [provider, setProvider] = useState<'gemini' | 'openrouter'>('gemini');
  const [openRouterModel, setOpenRouterModel] = useState<string>('deepseek/deepseek-chat');
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  // Save / Load state
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [saveSlotName, setSaveSlotName] = useState('');

  // Dynamic OpenRouter models
  const [orModels, setOrModels] = useState<{ id: string, name: string }[]>(() => {
    try {
      const stored = localStorage.getItem('eros_or_models');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return [
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Fast & Smart)" },
      { id: "gryphe/mythomax-l2-13b", name: "MythoMax L2 13B (Supreme Fiction & Roleplay)" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (High Intelligence)" },
      { id: "liquid/lfm-40b", name: "Liquid LFM 40B (Fluid Output)" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (Fallback Core)" }
    ];
  });
  const [customModelId, setCustomModelId] = useState('');
  const [customModelLabel, setCustomModelLabel] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchSuccessMessage, setFetchSuccessMessage] = useState('');

  // Import modal state
  const [showImport, setShowImport] = useState(false);
  const [importDef, setImportDef] = useState('');
  const [importName, setImportName] = useState('');
  const [importShort, setImportShort] = useState('');

  // Character Creator State
  const [showCreator, setShowCreator] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [creatorShort, setCreatorShort] = useState('');
  const [creatorSliders, setCreatorSliders] = useState({
    assertiveness: 50,
    sociability: 50,
    temperament: 50,
    height: 50,
    athleticism: 50,
    curviness: 55,
    dickSize: 0, // 0 means female default/None
  });

  // Sandbox AI Synthesizer and Startup config states
  const [charStartingArousals, setCharStartingArousals] = useState<Record<string, number>>({});
  const [creatorStartingArousal, setCreatorStartingArousal] = useState(20);
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState('');
  const [creatorAvatarPrompt, setCreatorAvatarPrompt] = useState('');
  const [avatarSynthing, setAvatarSynthing] = useState(false);
  const [avatarSynthError, setAvatarSynthError] = useState('');
  const [inlineSynthingId, setInlineSynthingId] = useState<string | null>(null);
  const [toastNotify, setToastNotify] = useState<{ message: string; isError: boolean } | null>(null);

  // Mobile navigation tabs state
  const [activeMobileTab, setActiveMobileTab] = useState<'timeline' | 'dossiers'>('timeline');

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);

  const restoreLocalData = () => {
    try {
      const stored = localStorage.getItem('eros_save_slots');
      if (stored) {
        setSaveSlots(JSON.parse(stored));
      } else {
        setSaveSlots([]);
      }
    } catch (e) {
      console.error('Failed to parse save slots', e);
    }

    try {
      const storedChars = localStorage.getItem('eros_custom_characters');
      if (storedChars) {
        const parsed: CharacterDefinition[] = JSON.parse(storedChars);
        setAvailableCharacters(prev => {
          const fresh = defaultCharacters.filter(c => !parsed.some(pc => pc.id === c.id));
          return [...fresh, ...parsed];
        });
        setActiveCharacterIds(prev => {
          const currentIds = [...prev];
          parsed.forEach(pc => {
            if (!currentIds.includes(pc.id) && currentIds.length < 6) {
              currentIds.push(pc.id);
            }
          });
          return currentIds;
        });
      } else {
        setAvailableCharacters(defaultCharacters);
        setActiveCharacterIds(defaultCharacters.map(c => c.id));
      }
    } catch (e) {
      console.error('Failed to parse custom characters', e);
    }
  };

  const syncFromFirestore = async (uid: string) => {
    try {
      // 1. Fetch saves
      const savesRef = collection(db, 'users', uid, 'saves');
      const savesSnap = await getDocs(savesRef);
      const fsSaves: SaveSlot[] = [];
      savesSnap.forEach(doc => {
        const data = doc.data();
        fsSaves.push({
          id: doc.id,
          name: data.name,
          timestamp: data.timestamp || new Date().toLocaleString(),
          messages: data.messages || [],
          scenarioInput: data.scenarioInput || '',
          playerCharacterId: data.playerCharacterId || '3rd_person',
          gameMode: data.gameMode || 'standard',
          activeCharacterIds: data.activeCharacterIds || [],
          provider: data.provider || 'gemini',
          openRouterModel: data.openRouterModel || '',
          customApiKey: data.customApiKey || ''
        });
      });
      // Sort by newest save
      fsSaves.sort((a, b) => b.id.localeCompare(a.id));
      setSaveSlots(fsSaves);

      // 2. Fetch custom characters
      const charsRef = collection(db, 'users', uid, 'customCharacters');
      const charsSnap = await getDocs(charsRef);
      const fsChars: CharacterDefinition[] = [];
      charsSnap.forEach(doc => {
        const data = doc.data();
        fsChars.push({
          id: doc.id,
          name: data.name,
          shortDescription: data.shortDescription || '',
          definition: data.definition || '',
          personality: data.personality || undefined,
          body: data.body || undefined,
          dickSize: data.dickSize || 0,
          avatarUrl: data.avatarUrl || undefined,
          startingArousal: data.startingArousal !== undefined ? data.startingArousal : undefined
        });
      });
      
      setAvailableCharacters(prev => {
        const clean = defaultCharacters.filter(c => !fsChars.some(fc => fc.id === c.id));
        return [...clean, ...fsChars];
      });

      setActiveCharacterIds(prev => {
        const currentIds = [...prev];
        fsChars.forEach(pc => {
          if (!currentIds.includes(pc.id) && currentIds.length < 6) {
            currentIds.push(pc.id);
          }
        });
        return currentIds;
      });

    } catch (err) {
      console.error("Firestore sync error:", err);
    }
  };

  // Listen to Auth State
  useEffect(() => {
    testConnection();

    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Register or status-update user profile in firestore
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              email: user.email || '',
              lastActive: new Date().toISOString()
            });
          } else {
            await updateDoc(userRef, {
              lastActive: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error("Firestore user profile instantiation failed:", err);
        }
        await syncFromFirestore(user.uid);
      } else {
        restoreLocalData();
      }
    });

    return () => unsub();
  }, []);

  // Auto-expire toast notifications after 4 seconds
  useEffect(() => {
    if (toastNotify) {
      const timer = setTimeout(() => {
        setToastNotify(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastNotify]);

  const handleSaveGame = async (name: string) => {
    if (!name.trim()) return;
    const newSlot: SaveSlot = {
      id: Date.now().toString(),
      name: name.trim(),
      timestamp: new Date().toLocaleString(),
      messages,
      scenarioInput,
      playerCharacterId,
      gameMode,
      activeCharacterIds,
      provider,
      openRouterModel,
      customApiKey
    };
    const updated = [newSlot, ...saveSlots];
    setSaveSlots(updated);
    localStorage.setItem('eros_save_slots', JSON.stringify(updated));
    setSaveSlotName('');

    if (auth.currentUser) {
      const path = `users/${auth.currentUser.uid}/saves/${newSlot.id}`;
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'saves', newSlot.id), {
          ...newSlot,
          userId: auth.currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const handleLoadGame = (slot: SaveSlot) => {
    setMessages(slot.messages);
    setScenarioInput(slot.scenarioInput);
    setPlayerCharacterId(slot.playerCharacterId);
    setGameMode(slot.gameMode);
    setActiveCharacterIds(slot.activeCharacterIds);
    setProvider(slot.provider || 'gemini');
    setOpenRouterModel(slot.openRouterModel || 'deepseek/deepseek-chat');
    setCustomApiKey(slot.customApiKey || '');
    setStarted(true);
    setShowSaveLoadModal(false);
  };

  const handleDeleteSlot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = saveSlots.filter(s => s.id !== id);
    setSaveSlots(updated);
    localStorage.setItem('eros_save_slots', JSON.stringify(updated));

    if (auth.currentUser) {
      const path = `users/${auth.currentUser.uid}/saves/${id}`;
      try {
        await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'saves', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const addAndPersistCustomCharacter = async (newChar: CharacterDefinition) => {
    setAvailableCharacters(prev => {
      const filtered = prev.filter(c => c.id !== newChar.id);
      const updated = [...filtered, newChar];
      // Keep only custom models in local storage (non-defaults)
      const customOnly = updated.filter(c => !defaultCharacters.some(dc => dc.id === c.id));
      localStorage.setItem('eros_custom_characters', JSON.stringify(customOnly));
      return updated;
    });
    
    setActiveCharacterIds(prev => {
      if (prev.length < 6 && !prev.includes(newChar.id)) {
        return [...prev, newChar.id];
      }
      return prev;
    });

    if (auth.currentUser) {
      const path = `users/${auth.currentUser.uid}/customCharacters/${newChar.id}`;
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'customCharacters', newChar.id), {
          id: newChar.id,
          name: newChar.name,
          shortDescription: newChar.shortDescription || '',
          definition: newChar.definition,
          personality: newChar.personality || null,
          body: newChar.body || null,
          dickSize: newChar.dickSize || 0,
          avatarUrl: newChar.avatarUrl || null,
          startingArousal: newChar.startingArousal !== undefined ? newChar.startingArousal : null,
          userId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  // Avatar icon rendering helper and handlers
  const renderCharacterAvatarIcon = (char: CharacterDefinition, sizeClass = "w-6 h-6 text-[9px]") => {
    if (char.avatarUrl) {
      return (
        <img 
          src={char.avatarUrl} 
          alt={char.name} 
          referrerPolicy="no-referrer"
          className={`${sizeClass.split(' ')[0]} ${sizeClass.split(' ')[1]} rounded-md object-cover border border-zinc-800 shrink-0 shadow-sm`}
        />
      );
    }
    
    // Draw a gorgeous geometric neon profile via CSS
    // Generates a deterministic colored gradient + glowing text-shadow based on the name hash
    const initials = char.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const hash = char.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hue = (hash * 137.508) % 360;
    
    return (
      <div 
        className={`${sizeClass} rounded-md border border-zinc-805 flex items-center justify-center font-mono font-black shrink-0 shadow-md select-none`}
        style={{
          background: `radial-gradient(circle, hsl(${hue}, 85%, 15%) 0%, #09090b 100%)`,
          color: `hsl(${hue}, 100%, 75%)`,
          textShadow: `0 0 6px hsl(${hue}, 100%, 55%)`
        }}
      >
        {initials}
      </div>
    );
  };

  // Generates avatar during creator modal phase
  const handleGenerateCreatorAvatar = async () => {
    if (!creatorAvatarPrompt.trim()) {
      setAvatarSynthError('Please type in a quick portrait prompt first');
      return;
    }
    
    setAvatarSynthing(true);
    setAvatarSynthError('');
    
    try {
      const resp = await fetch('/api/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: creatorAvatarPrompt.trim() })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Syntax failure in Gemini synthesis API');
      
      setCreatorAvatarUrl(data.imageUrl);
      setToastNotify({ message: 'Erotic portrait synthesized successfully!', isError: false });
    } catch (err: any) {
      console.error(err);
      const isQuotaExceeded = err.message.includes('429') || err.message.includes('Quota exceeded');
      setAvatarSynthError(isQuotaExceeded 
        ? 'Rate limit reached. Please try again in a moment.' 
        : `Failed to synthesize AI portrait: ${err.message}`);
      setToastNotify({ 
        message: isQuotaExceeded 
          ? 'Rate limit reached. Please wait a minute.' 
          : 'Offsite portraiting requires a paid API key.', 
        isError: true 
      });
    } finally {
      setAvatarSynthing(false);
    }
  };

  // Handles inline generation for any preset or custom character already on the selector grid
  const handleTriggerInlineSynthesizeAvatar = async (char: CharacterDefinition) => {
    setInlineSynthingId(char.id);
    const lookPrompt = `${char.name}, a detailed adult gaming portrait avatar, ${char.shortDescription || 'gorgeous character'}`;
    
    try {
      const resp = await fetch('/api/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: lookPrompt })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Gemini Model server communication timeout');
      
      const updatedChar = { ...char, avatarUrl: data.imageUrl };
      setAvailableCharacters(prev => {
        const filtered = prev.filter(c => c.id !== char.id);
        const updated = [...filtered, updatedChar];
        const customOnly = updated.filter(c => !defaultCharacters.some(dc => dc.id === c.id));
        localStorage.setItem('eros_custom_characters', JSON.stringify(customOnly));
        return updated;
      });

      if (auth.currentUser && !defaultCharacters.some(dc => dc.id === char.id)) {
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'customCharacters', char.id), {
          id: char.id,
          name: char.name,
          shortDescription: char.shortDescription || '',
          definition: char.definition,
          personality: char.personality || null,
          body: char.body || null,
          dickSize: char.dickSize || 0,
          avatarUrl: data.imageUrl,
          startingArousal: char.startingArousal !== undefined ? char.startingArousal : 20,
          userId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
      }
      setToastNotify({ message: `AI Portraiting for ${char.name} is complete!`, isError: false });
    } catch (err: any) {
      console.error(err);
      const isQuotaExceeded = err.message.includes('429') || err.message.includes('Quota exceeded');
      setToastNotify({ 
        message: isQuotaExceeded 
          ? `Rate limit reached. Try again later for ${char.name}.` 
          : 'AI requires a valid paid Gemini API key. Standing by with stylish local circle-art!', 
        isError: true 
      });
    } finally {
      setInlineSynthingId(null);
    }
  };

  const generateDefinitionFromSliders = (name: string, description: string, s: typeof creatorSliders) => {
    const calculatedHeight = Math.round(140 + (s.height / 100) * 70); // 140cm to 210cm
    
    // Dick size formatting text
    let dickDescription = "None/Female default";
    if (s.dickSize > 0) {
      const cm = Math.round(10 + (s.dickSize / 100) * 22); // 10cm to 32cm
      const inches = (cm / 2.54).toFixed(1);
      dickDescription = `${cm} cm (${inches} inches) - `;
      if (s.dickSize < 30) {
        dickDescription += "Compact, neat size.";
      } else if (s.dickSize < 70) {
        dickDescription += "Generously thick, highly visible print in athletic sweatpants.";
      } else {
        dickDescription += "Massive monster size, heavy undeniable print, dramatic focus highlight.";
      }
    }

    return `Character Definition: ${name}
Basic Information: Name: ${name}, ${description || 'Eros Simulation Cast Vector'}
Physical Dossier:
- Height: ${calculatedHeight} cm
- Athleticism Level: ${s.athleticism}% (Scale: 0%=Soft/Composed, 100%=Heavily Toned/Fit/Muscular)
- Body Curviness / Thickness: ${s.curviness}% (Scale: 0%=Lean/Fine-boned, 100%=Sensual/Hourglass/Voluptuous)
- Genital Blueprint / Dick Size: ${dickDescription}

Personality Framework Sliders:
- Dominance factor: ${s.assertiveness}% (Scale: 0%=Submissive/Shy, 100%=Dominant/Commanding)
- Sociability index: ${s.sociability}% (Scale: 0%=Introverted/Reserved, 100%=Boisterous/Extroverted)
- Mood temperament: ${s.temperament}% (Scale: 0%=Sweet/Composed/Patient, 100%=Aggressive/Volatile/Hot-headed)

Behavioral Response Guidelines:
- Act strictly according to these custom slider properties. 
- A character with high dominance (${s.assertiveness}%) will actively direct positions, tease possessively, use commanding dialogue, and refuse to subserve.
- A character with high volatile temperament (${s.temperament}%) will break into explosive flushes, easily express intense lust, or exhibit sudden mood spikes.
- If possessing a dick (${s.dickSize > 0 ? 'Yes: ' + dickDescription : 'No'}), emphasize their bulge shape under sweatpants, their arousal, and physical depth in all explicit interactive paths.`;
  };

  const handleCreateCharacter = () => {
    if (!creatorName.trim()) return;
    
    const targetId = creatorName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4);
    const customDef = generateDefinitionFromSliders(creatorName.trim(), creatorShort.trim(), creatorSliders);
    
    const newChar: CharacterDefinition = {
      id: targetId,
      name: creatorName.trim(),
      shortDescription: creatorShort.trim() || "Custom Simulation Vector",
      definition: customDef,
      personality: {
        assertiveness: creatorSliders.assertiveness,
        sociability: creatorSliders.sociability,
        temperament: creatorSliders.temperament
      },
      body: {
        height: creatorSliders.height,
        athleticism: creatorSliders.athleticism,
        curviness: creatorSliders.curviness
      },
      dickSize: creatorSliders.dickSize,
      avatarUrl: creatorAvatarUrl || undefined,
      startingArousal: creatorStartingArousal
    };

    addAndPersistCustomCharacter(newChar);
    
    // Reset state
    setShowCreator(false);
    setCreatorName('');
    setCreatorShort('');
    setCreatorStartingArousal(20);
    setCreatorAvatarUrl('');
    setCreatorAvatarPrompt('');
    setAvatarSynthError('');
    setCreatorSliders({
      assertiveness: 50,
      sociability: 50,
      temperament: 50,
      height: 50,
      athleticism: 50,
      curviness: 55,
      dickSize: 0
    });
  };

  const handleImport = () => {
    if (!importName || !importDef) return;
    const targetId = importName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4);
    const newChar: CharacterDefinition = {
      id: targetId,
      name: importName.trim(),
      shortDescription: importShort.trim() || 'Imported Blueprint Vector',
      definition: importDef
    };
    
    addAndPersistCustomCharacter(newChar);
    setShowImport(false);
    setImportName('');
    setImportShort('');
    setImportDef('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          setImportName(parsed.name || parsed.id || '');
          setImportShort(parsed.shortDescription || parsed.description || parsed.hook || '');
          setImportDef(parsed.definition || parsed.definitionText || parsed.bio || parsed.backstory || text);
        } catch (err) {
          setImportName(file.name.replace(/\.[^/.]+$/, ""));
          setImportDef(text);
        }
      } else {
        // Simple unstructured text file
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length >= 3) {
          setImportName(lines[0]);
          setImportShort(lines[1]);
          setImportDef(lines.slice(2).join('\n'));
        } else {
          setImportName(file.name.replace(/\.[^/.]+$/, ""));
          setImportDef(text);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleAddCustomModel = () => {
    if (!customModelId.trim() || !customModelLabel.trim()) return;
    const newModel = { id: customModelId.trim(), name: customModelLabel.trim() };
    const updated = [...orModels, newModel];
    setOrModels(updated);
    localStorage.setItem('eros_or_models', JSON.stringify(updated));
    setCustomModelId('');
    setCustomModelLabel('');
  };

  const handleFetchOpenRouterModels = async () => {
    setFetchingModels(true);
    setFetchSuccessMessage('');
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) throw new Error('Network error fetching OpenRouter models');
      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        const mapped = data.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.id
        }));
        // Sort alphabetically
        mapped.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setOrModels(mapped);
        localStorage.setItem('eros_or_models', JSON.stringify(mapped));
        setFetchSuccessMessage(`Successfully synchronized ${mapped.length} available OpenRouter models!`);
      }
    } catch (err: any) {
      console.error(err);
      setFetchSuccessMessage(`Failed to synchronize: ${err.message}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const initiateGame = async () => {
    setStarted(true);
    setLoading(true);
    setError('');
    
    // First message to kick off the prompt
    const kickoffMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: 'Begin the scenario.',
      isInitial: true
    };
    
    setMessages([kickoffMessage]);
    
    const context = {
      characters: availableCharacters.filter(c => activeCharacterIds.includes(c.id)),
      playerCharacterId,
      gameMode,
      scenarioDescription: scenarioInput
    };
    
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [kickoffMessage], 
          scenarioContext: context,
          provider,
          openRouterModel,
          customApiKey
        })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch');
      
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', content: data.text }
      ]);
    } catch (err: any) {
      setError(err.message);
      setStarted(false); 
    } finally {
      setLoading(false);
    }
  };

  const handleChoice = async (optionText: string) => {
    if (loading) return;
    
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: optionText
    };
    
    const newContext = [...messages, newUserMsg];
    setMessages(newContext);
    setLoading(true);
    setError('');
    
    const context = {
      characters: availableCharacters.filter(c => activeCharacterIds.includes(c.id)),
      playerCharacterId,
      gameMode,
      scenarioDescription: scenarioInput // Keeps context intact if needed for regeneration or system prompt refresh
    };

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newContext, 
          scenarioContext: context,
          provider,
          openRouterModel,
          customApiKey
        })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch');
      
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', content: data.text }
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [customInput, setCustomInput] = useState('');
  
  const handleCustomChoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    handleChoice(customInput.trim());
    setCustomInput('');
  };

  const handleSwitchToGeminiAndResume = async () => {
    setProvider('gemini');
    setError('');
    setLoading(true);
    
    const context = {
      characters: availableCharacters.filter(c => activeCharacterIds.includes(c.id)),
      playerCharacterId,
      gameMode,
      scenarioDescription: scenarioInput
    };

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages, 
          scenarioContext: context,
          provider: 'gemini',
          openRouterModel,
          customApiKey: ''
        })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch');
      
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', content: data.text }
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Find the last model message to render choices and character states
  const lastModelMsgIndex = [...messages].reverse().findIndex(m => m.role === 'model');
  const recentModelMsg = lastModelMsgIndex !== -1 ? messages[messages.length - 1 - lastModelMsgIndex] : null;
  const parsedRecent = recentModelMsg ? parseModelResponse(recentModelMsg.content) : null;
  // If we are currently loading, we might want to keep displaying the old states
  // Actually, parsedRecent will represent the last full state.

  // Intro Screen
  if (!started) {
    return (
      <div className="min-h-screen bg-[#07070a] text-zinc-300 flex items-center justify-center p-4 md:p-8 font-sans relative overflow-hidden selection:bg-red-900 selection:text-white">
        {/* Ambient atmospheric cyber glow background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-[0.04] bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.85),transparent_65%)]" />

        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 relative z-10">
          
          {/* Left Configuration Panel */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="md:col-span-7 space-y-6 flex flex-col justify-center"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
              <div className="space-y-1">
                <h1 className="text-3xl font-display font-black tracking-tight text-white flex items-center gap-2 uppercase">
                  <div className="w-8 h-8 bg-red-600 rounded-sm flex items-center justify-center font-black italic text-lg text-white shadow-md shadow-red-900/40">E</div>
                  EROS <span className="text-red-500 font-light">FWK</span>
                </h1>
                <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
                  INITIALIZING SIMULATION ENVIRONMENT
                </p>
              </div>

              {/* Toolbar in Setup */}
              <div className="flex items-center gap-2">
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="px-2.5 py-1.5 bg-green-950/20 hover:bg-green-950/40 border border-green-900/40 rounded-lg text-green-400 hover:text-green-300 transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider font-mono shadow-sm cursor-pointer"
                    title={`Signed in as ${currentUser.email}. Click to sign out.`}
                  >
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span>Sync ON</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => signInWithPopup(auth, googleProvider)}
                    className="px-2.5 py-1.5 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 rounded-lg text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider font-mono shadow-sm cursor-pointer"
                    title="Sign in with Google to enable cloud backups"
                  >
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    <span>Cloud Sync</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSaveLoadModal(true)}
                  className="px-2.5 py-1.5 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider font-mono shadow-sm"
                  title="Saves History"
                >
                  <History className="w-3.5 h-3.5 text-red-500" />
                  <span>Saves</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="px-2.5 py-1.5 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider font-mono shadow-sm"
                  title="Configure AI API"
                >
                  <Settings className="w-3.5 h-3.5 text-red-500" />
                  <span>API Core</span>
                </button>
              </div>
            </div>

            {/* Scenario Presets Selection Row */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-mono">Scenario Theme Preset</label>
              <div className="grid grid-cols-2 gap-2.5">
                {defaultScenarios.map(sc => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setSelectedScenarioPresetId(sc.id);
                      setScenarioInput(sc.fullSetup);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col items-start gap-1 relative overflow-hidden ${
                      selectedScenarioPresetId === sc.id
                        ? 'bg-red-950/15 border-red-600/70 text-zinc-100 shadow-red-glow'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-805 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-xs font-display font-bold flex items-center gap-1.5">
                      <span className="text-base">{sc.emoji}</span> {sc.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 line-clamp-1 leading-normal">{sc.shortDescription}</span>
                    {selectedScenarioPresetId === sc.id && (
                      <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-red-500 rounded-bl-sm" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Scenario setup backdrop */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-mono">Scenario Setup Blueprint</label>
                <span className="text-[9px] text-zinc-650 font-mono">(Custom backdrops)</span>
              </div>
              <textarea 
                className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3.5 text-zinc-200 focus:outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 focus:shadow-red-glow transition-all font-sans text-xs leading-relaxed h-[100px] resize-none"
                value={scenarioInput}
                onChange={(e) => {
                  setScenarioInput(e.target.value);
                  setSelectedScenarioPresetId(''); // clear preset since user custom-edited
                }}
                placeholder="Declare boundary rules, situational backstory, and character constraints..."
              />
            </div>

            {/* Game Mode */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-mono">Framework Execution Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGameMode('standard')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-0.5 transition-colors relative ${
                    gameMode === 'standard' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <Send className={`w-3.5 h-3.5 ${gameMode === 'standard' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Standard Sandbox
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-normal">NPC cast events await your explicit action triggers.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode('free_will')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-0.5 transition-colors relative ${
                    gameMode === 'free_will' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <Brain className={`w-3.5 h-3.5 ${gameMode === 'free_will' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Free Will Mode
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-normal">NPC entities proactively drive relationship outcomes.</span>
                </button>
              </div>
            </div>

            <button
              onClick={initiateGame}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-red-650 hover:bg-red-700 text-white rounded-xl font-display font-bold uppercase tracking-widest transition-all duration-200 disabled:opacity-50 text-xs shadow-lg shadow-red-950/20 active:translate-y-[1px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Commence Simulation Lifecycle
            </button>
            
            {error && (
              <div className="space-y-3 mt-3">
                <div className="text-red-450 text-xs bg-red-950/10 border border-red-900/30 p-3.5 rounded-xl font-mono leading-relaxed">
                  <span className="font-bold block mb-1 text-red-500">⚠️ SIMULATION INITIALIZATION FAULT:</span>
                  {error}
                </div>
                {provider === 'openrouter' && (
                  <div className="bg-zinc-950/50 border border-zinc-900 p-3 rounded-xl text-xs space-y-2 text-zinc-400 leading-normal">
                    <p>
                      Your OpenRouter configuration returned an API error (likely due to insufficient or missing credits). 
                    </p>
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase font-bold pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProvider('gemini');
                          setError('');
                        }}
                        className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/50 border border-red-900/40 hover:text-white text-red-400 rounded-lg transition-colors flex items-center gap-1"
                      >
                        ⚡ Switch to Free Gemini Core
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg transition-colors"
                      >
                        ⚙️ Configure Custom Key
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Right Cast Panel */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="md:col-span-5 bg-zinc-950/40 border border-zinc-900 rounded-2xl p-6 space-y-5 relative overflow-hidden flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                <h2 className="text-xs font-display font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Users className="w-4 h-4 text-red-500" /> Active Cast Matrix
                </h2>
                <span className="text-[10px] font-mono text-zinc-550">{activeCharacterIds.length}/6 ACTIVE</span>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto scrollbar-thin pr-1">
                {availableCharacters.map(char => {
                  const isActive = activeCharacterIds.includes(char.id);
                  const isPOV = playerCharacterId === char.id;
                  const isSynthingThis = inlineSynthingId === char.id;
                  const currentStartingArousal = charStartingArousals[char.id] ?? char.startingArousal ?? 20;

                  return (
                    <div 
                      key={char.id} 
                      className={`p-3 rounded-xl border transition-all duration-300 flex flex-col gap-2 ${
                        isActive 
                          ? 'bg-zinc-900/50 border-zinc-800' 
                          : 'bg-zinc-950/20 border-zinc-900/50 opacity-60 hover:opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <label className="flex items-center gap-2 cursor-pointer shrink-0">
                            <input 
                              type="checkbox" 
                              className="accent-red-650 rounded bg-zinc-950 border-zinc-805 text-red-600 focus:ring-0 focus:ring-offset-0"
                              checked={isActive}
                              onChange={(e) => {
                                if (e.target.checked && activeCharacterIds.length < 6) {
                                  setActiveCharacterIds(prev => [...prev, char.id]);
                                  if (charStartingArousals[char.id] === undefined) {
                                    setCharStartingArousals(prev => ({
                                      ...prev,
                                      [char.id]: char.startingArousal ?? 20
                                    }));
                                  }
                                } else if (!e.target.checked) {
                                  setActiveCharacterIds(prev => prev.filter(id => id !== char.id));
                                  if (playerCharacterId === char.id) setPlayerCharacterId('3rd_person');
                                }
                              }}
                            />
                          </label>
                          
                          {/* Visual Avatar frame & status */}
                          <div className="relative shrink-0 select-none">
                            {isSynthingThis ? (
                              <div className="w-8 h-8 rounded-md bg-zinc-950 border border-red-500 flex items-center justify-center shadow-sm">
                                <Sparkles className="w-4 h-4 text-red-500 animate-spin" />
                              </div>
                            ) : (
                              renderCharacterAvatarIcon(char, "w-8 h-8 text-[11px]")
                            )}
                          </div>

                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`font-display font-bold text-xs truncate ${isActive ? 'text-zinc-150 font-semibold' : 'text-zinc-550'}`}>
                              {char.name}
                            </span>
                            <span className="text-[8px] text-zinc-500 font-mono tracking-wider font-semibold uppercase leading-none mt-0.5">
                              {defaultCharacters.some(dc => dc.id === char.id) ? 'PRESET ARCHETYPE' : 'CUSTOM AVATAR'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* AI portrait gen triggers */}
                          <button
                            type="button"
                            title="Generate/Refine Portrait using AI"
                            onClick={() => handleTriggerInlineSynthesizeAvatar(char)}
                            disabled={isSynthingThis}
                            className="w-6 h-6 rounded bg-zinc-950 border border-zinc-850 text-zinc-500 hover:text-red-400 hover:border-red-900/40 flex items-center justify-center transition-all disabled:opacity-40 hover:scale-105 active:scale-95"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>

                          {isActive && (
                            <button
                              type="button"
                              onClick={() => setPlayerCharacterId(isPOV ? '3rd_person' : char.id)}
                              className={`text-[9.5px] font-mono tracking-wider h-6 px-2 rounded transition-all duration-150 ${
                                isPOV 
                                  ? 'bg-red-950/60 text-red-400 border border-red-900/40 font-extrabold' 
                                  : 'bg-zinc-950 hover:bg-zinc-805 text-zinc-500 hover:text-zinc-300 border border-zinc-900'
                              }`}
                            >
                              {isPOV ? 'POV' : 'POV Play'}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="pl-6 md:pl-8">
                        <p className={`text-[11px] leading-relaxed ${isActive ? 'text-zinc-400 font-sans' : 'text-zinc-650'}`}>
                          {char.shortDescription}
                        </p>
                        
                        {/* Interactive Initial Arousal Configurator */}
                        {isActive && (
                          <div className="mt-2 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-900/40 space-y-1">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="text-zinc-550 font-mono font-bold uppercase tracking-wider">Starting Arousal</span>
                              <span className="text-red-500 font-mono font-black">{currentStartingArousal}%</span>
                            </div>
                            <input 
                              type="range" min="0" max="100" step="5"
                              className="w-full accent-red-650 h-1 bg-zinc-900 rounded-lg cursor-pointer transition-colors"
                              value={currentStartingArousal}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setCharStartingArousals(prev => ({ ...prev, [char.id]: val }));
                              }}
                            />
                            <div className="flex justify-between text-[7px] text-zinc-600 font-mono uppercase tracking-widest pt-0.5">
                              <span>Relaxed</span>
                              <span>Flushed</span>
                              <span>Urgent</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
               <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowImport(true)}
                disabled={activeCharacterIds.length >= 6}
                className="py-2.5 border border-dashed border-zinc-800/80 hover:border-red-900/60 rounded-xl text-zinc-500 hover:text-zinc-350 transition-colors flex items-center justify-center gap-1.5 text-[11px] font-mono disabled:opacity-40"
              >
                <Upload className="w-3.5 h-3.5 text-red-500" />
                <span>Import DNA File</span>
              </button>
              
              <button
                type="button"
                onClick={() => setShowCreator(true)}
                disabled={activeCharacterIds.length >= 6}
                className="py-2.5 border border-dashed border-zinc-800/80 hover:border-red-900/60 rounded-xl text-zinc-500 hover:text-zinc-350 transition-colors flex items-center justify-center gap-1.5 text-[11px] font-mono disabled:opacity-40"
              >
                <Sliders className="w-3.5 h-3.5 text-red-500" />
                <span>Create Custom</span>
              </button>
            </div>
          </motion.div>
        </div>


        {/* Modal for Import */}
        {showImport && (
           <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-4">
                 <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <h3 className="font-bold uppercase tracking-widest text-zinc-300 text-xs font-mono flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-red-500" /> Import Character Blueprint
                    </h3>
                    <button onClick={() => setShowImport(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
                 </div>
                 
                 {/* File Upload Zone */}
                 <div className="border border-dashed border-zinc-800 hover:border-red-900/60 transition-colors rounded-xl p-4 bg-zinc-950/40 relative flex flex-col items-center justify-center text-center">
                    <input 
                      type="file" 
                      accept=".txt,.json" 
                      id="char-file-upload" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={handleFileUpload}
                    />
                    <Upload className="w-6 h-6 text-zinc-650 mb-1" />
                    <span className="text-xs text-zinc-300 font-bold">Upload Character File</span>
                    <span className="text-[10px] text-zinc-500 mt-0.5">Supports standard .txt or JSON formats</span>
                 </div>

                 <div className="space-y-3">
                   <input 
                     type="text" 
                     placeholder="Character Name" 
                     className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-zinc-300 outline-none focus:border-red-900 text-xs"
                     value={importName} onChange={e => setImportName(e.target.value)}
                   />
                   <input 
                     type="text" 
                     placeholder="Very short hook (e.g. 'Playful colleague')" 
                     className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-zinc-300 outline-none focus:border-red-900 text-xs"
                     value={importShort} onChange={e => setImportShort(e.target.value)}
                   />
                   <textarea
                      placeholder="Paste narrative background definition or let system auto-populate from uploaded file..."
                      className="w-full h-32 bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-zinc-300 outline-none focus:border-red-900 scrollbar-thin text-xs font-mono"
                      value={importDef} onChange={e => setImportDef(e.target.value)}
                   />
                 </div>
                 <button 
                   onClick={handleImport}
                   disabled={!importName || !importDef}
                   className="w-full bg-red-650 hover:bg-red-700 text-white font-bold p-3 rounded-lg disabled:opacity-50 transition-colors uppercase font-mono tracking-widest text-xs"
                 >
                   Inject Cast Vector
                 </button>
              </div>
           </div>
        )}

        {/* Modal for Character Creator with Sliders */}
        {showCreator && (
           <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-4 my-8 text-left relative z-50 shadow-2xl">
                 <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <h3 className="font-display font-black text-xs uppercase tracking-widest text-zinc-200 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-red-500" /> Vector Character Creator
                    </h3>
                    <button onClick={() => setShowCreator(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
                 </div>

                 <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
                   {/* Demographics */}
                   <div className="space-y-1">
                     <label className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono">Character Identity</label>
                     <input 
                       type="text" 
                       placeholder="Identity Name (e.g. 'Isabella', 'Jax')" 
                       className="w-full bg-zinc-950 border border-zinc-850 p-2.5 rounded-lg text-zinc-200 outline-none focus:border-red-900 text-xs"
                       value={creatorName} onChange={e => setCreatorName(e.target.value)}
                     />
                   </div>
                   <div className="space-y-1">
                     <input 
                       type="text" 
                       placeholder="Short hook (e.g. 'Aloof boss', 'Possessive rival')" 
                       className="w-full bg-zinc-950 border border-zinc-855 p-2.5 rounded-lg text-zinc-200 outline-none focus:border-red-900 text-xs"
                       value={creatorShort} onChange={e => setCreatorShort(e.target.value)}
                     />
                   </div>

                   {/* SLIDERS GRID */}
                   <div className="space-y-3 pt-2">
                     <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono border-b border-zinc-850 pb-1">Personality Matrix Sliders</span>
                     
                     <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2.5 rounded-lg">
                       <div className="flex justify-between text-[10px]">
                         <span className="text-zinc-400 font-medium font-sans">Assertiveness</span>
                         <span className="text-red-500 font-mono font-bold">{creatorSliders.assertiveness}% {creatorSliders.assertiveness >= 50 ? 'Dominant/Tease' : 'Submissive/Gentle'}</span>
                       </div>
                       <input 
                         type="range" min="0" max="100" 
                         className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                         value={creatorSliders.assertiveness}
                         onChange={e => setCreatorSliders(prev => ({...prev, assertiveness: parseInt(e.target.value)}))}
                       />
                       <div className="flex justify-between text-[8px] text-zinc-600 uppercase font-mono tracking-wider">
                         <span>Submissive & Compliant</span>
                         <span>Commanding & Dominant</span>
                       </div>
                     </div>

                     <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2.5 rounded-lg">
                       <div className="flex justify-between text-[10px]">
                         <span className="text-zinc-400 font-medium font-sans">Sociability</span>
                         <span className="text-red-500 font-mono font-bold">{creatorSliders.sociability}% {creatorSliders.sociability >= 50 ? 'Extravert/Playful' : 'Introvert/Reserved'}</span>
                       </div>
                       <input 
                         type="range" min="0" max="100" 
                         className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                         value={creatorSliders.sociability}
                         onChange={e => setCreatorSliders(prev => ({...prev, sociability: parseInt(e.target.value)}))}
                       />
                       <div className="flex justify-between text-[8px] text-zinc-600 uppercase font-mono tracking-wider">
                         <span>Quiet & Reserved</span>
                         <span>Outgoing & Flirty</span>
                       </div>
                     </div>

                     <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2.5 rounded-lg">
                       <div className="flex justify-between text-[10px]">
                         <span className="text-zinc-400 font-medium font-sans">Temperament</span>
                         <span className="text-red-500 font-mono font-bold">{creatorSliders.temperament}% {creatorSliders.temperament >= 50 ? 'Volatile/Intense' : 'Vibe-Sweet/Calm'}</span>
                       </div>
                       <input 
                         type="range" min="0" max="100" 
                         className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                         value={creatorSliders.temperament}
                         onChange={e => setCreatorSliders(prev => ({...prev, temperament: parseInt(e.target.value)}))}
                       />
                       <div className="flex justify-between text-[8px] text-zinc-600 uppercase font-mono tracking-wider">
                         <span>Patient & Composed</span>
                         <span>Aggressive & Volatile</span>
                       </div>
                     </div>

                     <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono border-b border-zinc-855 pb-1 pt-1">Body Scale Sliders</span>
                     
                     <div className="grid grid-cols-2 gap-2">
                       <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2 rounded-lg">
                         <div className="flex justify-between text-[9px]">
                           <span className="text-zinc-400">Height</span>
                           <span className="text-red-400 font-mono font-bold">{Math.round(140 + (creatorSliders.height / 100) * 70)} cm</span>
                         </div>
                         <input 
                           type="range" min="0" max="100" 
                           className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                           value={creatorSliders.height}
                           onChange={e => setCreatorSliders(prev => ({...prev, height: parseInt(e.target.value)}))}
                         />
                       </div>

                       <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2 rounded-lg">
                         <div className="flex justify-between text-[9px]">
                           <span className="text-zinc-400 font-sans">Athleticism</span>
                           <span className="text-red-400 font-mono font-bold">{creatorSliders.athleticism}% fit</span>
                         </div>
                         <input 
                           type="range" min="0" max="100" 
                           className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                           value={creatorSliders.athleticism}
                           onChange={e => setCreatorSliders(prev => ({...prev, athleticism: parseInt(e.target.value)}))}
                         />
                       </div>

                       <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2 rounded-lg col-span-2">
                         <div className="flex justify-between text-[9px]">
                           <span className="text-zinc-400">Body Depth & Curves</span>
                           <span className="text-red-400 font-mono font-bold">{creatorSliders.curviness}%</span>
                         </div>
                         <input 
                           type="range" min="0" max="100" 
                           className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                           value={creatorSliders.curviness}
                           onChange={e => setCreatorSliders(prev => ({...prev, curviness: parseInt(e.target.value)}))}
                         />
                         <div className="flex justify-between text-[8px] text-zinc-655 uppercase font-mono tracking-wider pt-0.5">
                           <span>Petite & Lean</span>
                           <span>Thick & Curvy / Voluptuous Hourglass</span>
                         </div>
                       </div>
                     </div>

                     <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono border-b border-zinc-855 pb-1 pt-1">Genital Endowments</span>

                      {/* Sandbox Startup Settings */}
                      <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono border-b border-zinc-855 pb-1 pt-1">Sandbox Startup Settings</span>
                      
                      <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2.5 rounded-lg mb-2">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400 font-medium font-sans">Starting Arousal</span>
                          <span className="text-red-500 font-mono font-bold">
                            {creatorStartingArousal}%
                          </span>
                        </div>
                        <input 
                          type="range" min="0" max="100" step="5"
                          className="w-full accent-red-650 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                          value={creatorStartingArousal}
                          onChange={e => setCreatorStartingArousal(parseInt(e.target.value))}
                        />
                        <div className="flex justify-between text-[8px] text-zinc-650 uppercase font-mono tracking-wider font-semibold">
                          <span>Completely Calm (0%)</span>
                          <span>Fully Aroused / Sensitive (100%)</span>
                        </div>
                      </div>

                      {/* Character Photo Identity */}
                      <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono border-b border-zinc-855 pb-1 pt-2">Character Photo Identity</span>
                      
                      <div className="space-y-3 bg-zinc-950/40 border border-zinc-855 p-3 rounded-lg mb-4 text-left">
                        <div className="flex items-center gap-3">
                          {creatorAvatarUrl ? (
                            <img 
                              src={creatorAvatarUrl} 
                              alt="Erotic preview" 
                              className="w-12 h-12 rounded-lg object-cover border border-red-900/50 shadow-md animate-fade-in" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center font-mono font-black text-[10px] text-zinc-600 bg-zinc-950 shadow-inner">
                              NONE
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="text-[9px] text-zinc-400 font-mono uppercase tracking-wider font-bold leading-none">AI Visual Synthing</div>
                            <input
                              type="text"
                              value={creatorAvatarPrompt}
                              onChange={(e) => setCreatorAvatarPrompt(e.target.value)}
                              placeholder="e.g., gorgeous blond fitness model portrait"
                              className="w-full bg-zinc-950 border border-zinc-850 px-2 py-1.5 text-zinc-200 text-xs rounded-lg outline-none focus:border-red-900 placeholder:text-zinc-700 font-sans"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleGenerateCreatorAvatar}
                            disabled={avatarSynthing}
                            className="flex-1 py-1.5 px-3 bg-red-950/60 hover:bg-red-900/40 border border-red-900/40 text-red-400 disabled:opacity-40 transition-colors rounded-lg text-[10px] uppercase font-mono font-bold tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-red-500 animate-spin" />
                            {avatarSynthing ? 'Synthesizing...' : 'Gen Portrait with AI'}
                          </button>
                        </div>
                        
                        {avatarSynthError && (
                          <div className="text-[10px] text-red-400 font-mono leading-relaxed pt-1 border-t border-zinc-900">{avatarSynthError}</div>
                        )}
                      </div>
                     
                     <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2.5 rounded-lg">
                       <div className="flex justify-between text-[10px]">
                         <span className="text-zinc-400 font-medium">Dick Size</span>
                         <span className="text-red-500 font-mono font-bold">
                           {creatorSliders.dickSize === 0 ? 'None (Female Default)' : `${Math.round(10 + (creatorSliders.dickSize / 100) * 22)} cm (${((Math.round(10 + (creatorSliders.dickSize / 100) * 22)) / 2.54).toFixed(1)} inches)`}
                         </span>
                       </div>
                       <input 
                         type="range" min="0" max="100" 
                         className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                         value={creatorSliders.dickSize}
                         onChange={e => setCreatorSliders(prev => ({...prev, dickSize: parseInt(e.target.value)}))}
                       />
                       <div className="flex justify-between text-[8px] text-zinc-600 uppercase font-mono tracking-wider">
                         <span>Smooth / Default</span>
                         <span>Extravagant Bulk & Length</span>
                       </div>
                     </div>
                   </div>
                 </div>

                 <button 
                   type="button"
                   onClick={handleCreateCharacter}
                   disabled={!creatorName.trim()}
                   className="w-full bg-red-650 hover:bg-red-700 text-white font-bold p-3 rounded-xl disabled:opacity-50 transition-colors uppercase font-mono tracking-widest text-xs mt-2"
                 >
                   Instantiate Character Core Vector
                 </button>
              </div>
           </div>
        )}

        {/* Modal for Save/Load Game */}
        {showSaveLoadModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-xl w-full space-y-5 relative shadow-2xl text-left">
              <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-red-500" />
                  <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100">Eros Memory Drive</h3>
                </div>
                <button onClick={() => setShowSaveLoadModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
              </div>

              {/* Cloud Deck / Firebase State Controller */}
              <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${currentUser ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-350">
                      {currentUser ? 'Cloud Sync Online' : 'Local Only Mode'}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {currentUser ? `Synced: ${currentUser.email}` : 'Sign in to access secure cloud saves & custom characters across devices'}
                  </p>
                </div>

                {currentUser ? (
                  <button
                    onClick={() => signOut(auth)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-mono font-bold uppercase transition-all shrink-0 cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => signInWithPopup(auth, googleProvider)}
                    className="px-3 py-1.5 bg-red-650/15 hover:bg-red-600/20 border border-red-900/50 hover:border-red-500 text-red-400 hover:text-red-300 rounded-lg text-xs font-mono font-bold uppercase transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Connect Google
                  </button>
                )}
              </div>

              {/* Save current game action */}
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Save Current State</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter save slot name..."
                    className="flex-1 bg-zinc-905 border border-zinc-800 p-2.5 rounded-lg text-zinc-300 text-sm outline-none focus:border-red-900 placeholder:text-zinc-650"
                    value={saveSlotName}
                    onChange={(e) => setSaveSlotName(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (!saveSlotName.trim()) return;
                      handleSaveGame(saveSlotName);
                    }}
                    disabled={!saveSlotName.trim()}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs uppercase tracking-wide disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Code</span>
                  </button>
                </div>
              </div>

              {/* Save Slots List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Memory Slots ({saveSlots.length})</h4>
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                  {saveSlots.length === 0 ? (
                    <div className="text-center py-6 text-xs text-zinc-600 italic">No saved states found. Create one to lock your custom path.</div>
                  ) : (
                    saveSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="bg-zinc-950/40 hover:bg-zinc-955 border border-zinc-800/80 p-3 rounded-xl flex items-center justify-between gap-4 transition-all"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-zinc-200 truncate">{slot.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-750 text-zinc-450 rounded uppercase font-bold shrink-0 font-mono">
                              {slot.messages.length > 0 ? `${slot.messages.length} steps` : 'Setup Preset'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500 font-mono">
                            <span>{slot.timestamp}</span>
                            <span>•</span>
                            <span className="capitalize">{slot.provider || 'gemini'}</span>
                            <span>•</span>
                            <span className="lowercase">{slot.gameMode === 'free_will' ? 'free will' : 'standard'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleLoadGame(slot)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white font-bold rounded-lg text-xs uppercase tracking-wide transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={(e) => handleDeleteSlot(slot.id, e)}
                            className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-red-900 hover:bg-red-950/10 text-zinc-500 hover:text-red-400 rounded-lg transition-colors"
                            title="Delete Save"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal for Settings / API Core */}
        {showSettings && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-5 relative shadow-2xl text-left">
              <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-red-500" />
                  <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100 font-mono">Generative Cores</h3>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
              </div>

              <div className="space-y-4">
                {/* AI Gateway Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Gateway Provider</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setProvider('gemini')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        provider === 'gemini'
                          ? 'bg-zinc-800 border-red-500 text-zinc-100'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      <span className="font-bold text-xs uppercase block">Gemini Core</span>
                      <span className="text-[10px] text-zinc-500">Free, fast default server-side API.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvider('openrouter')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        provider === 'openrouter'
                          ? 'bg-zinc-800 border-red-500 text-zinc-100'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      <span className="font-bold text-xs uppercase block">OpenRouter API</span>
                      <span className="text-[10px] text-zinc-500">Unlock MythoMax, Llama, DeepSeek.</span>
                    </button>
                  </div>
                </div>

                {provider === 'openrouter' && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800"
                  >
                    {/* Model Select */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">OpenRouter Model</label>
                      <select
                        className="w-full bg-zinc-900 border border-zinc-800 p-2 text-zinc-300 rounded-lg text-xs outline-none focus:border-red-900"
                        value={openRouterModel}
                        onChange={(e) => setOpenRouterModel(e.target.value)}
                      >
                        {orModels.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>

                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={handleFetchOpenRouterModels}
                          disabled={fetchingModels}
                          className="w-full py-1.5 px-3 bg-red-950/40 hover:bg-red-900/40 border border-red-900/30 text-red-400 rounded text-[10px] font-mono tracking-wider font-bold uppercase transition-colors disabled:opacity-50"
                        >
                          {fetchingModels ? 'Synchronizing List...' : '🔄 Pull Live OpenRouter Models List'}
                        </button>
                      </div>

                      {fetchSuccessMessage && (
                        <p className="text-[10px] text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-900 leading-normal font-mono text-center">
                          {fetchSuccessMessage}
                        </p>
                      )}

                      <div className="border-t border-zinc-850 pt-2.5 space-y-2 mt-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Inject Custom Model ID</span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. meta-llama/llama-3-70b"
                            className="flex-1 bg-zinc-950 border border-zinc-800 p-2 text-zinc-350 text-xs font-mono rounded"
                            value={customModelId}
                            onChange={e => setCustomModelId(e.target.value)}
                          />
                          <input
                            type="text"
                            placeholder="e.g. Llama 3"
                            className="w-[100px] bg-zinc-950 border border-zinc-800 p-2 text-zinc-350 text-xs rounded"
                            value={customModelLabel}
                            onChange={e => setCustomModelLabel(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomModel}
                            disabled={!customModelId.trim() || !customModelLabel.trim()}
                            className="px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs rounded border border-zinc-700 font-bold transition-all disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* API Key Override */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Personal OpenRouter Key</label>
                        <span className="text-[9px] text-zinc-650 font-mono">(Optional)</span>
                      </div>
                      <input
                        type="password"
                        placeholder="sk-or-v1-..."
                        className="w-full bg-zinc-900 border border-zinc-800 p-2 text-zinc-300 text-xs outline-none font-mono focus:border-red-900"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                      />
                      <p className="text-[9px] text-zinc-500 leading-normal">
                        Overrides the server-side placeholder key. Stored only in local browser memory. Leave blank to fallback to server environment key if configured.
                      </p>
                    </div>
                  </motion.div>
                )}

                {provider === 'gemini' && (
                  <div className="p-3 bg-zinc-950/30 border border-zinc-850 rounded-xl text-xs text-zinc-500 leading-relaxed">
                    Uses the secure server-integrated Google **Gemini 2.5 Flash** model with optimal safety filters bypassed for explicit adult creative contexts. Under limit conditions, toggle OpenRouter.
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold p-3 rounded-xl hover:shadow-lg transition-colors text-xs uppercase tracking-widest"
              >
                Apply Core Configurations
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Story
  return (
    <div className="h-screen w-full bg-[#07070a] text-zinc-100 p-2 md:p-5 flex flex-col gap-3 md:gap-4 overflow-hidden font-sans selection:bg-red-950 selection:text-white">
      {/* Simulation Header */}
      <header className="flex items-center justify-between border-b border-zinc-900 pb-2 md:pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 md:w-8 md:h-8 bg-red-600 rounded-sm flex items-center justify-center font-black italic text-base md:text-lg text-white shadow-md shadow-red-950/40">E</div>
          <h1 className="text-base md:text-lg font-display font-black tracking-tight uppercase text-zinc-100">
            EROS <span className="text-red-500 font-light">SIMULATION</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 font-mono">
          {currentUser ? (
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="p-1.5 md:px-3 md:py-1.5 bg-green-950/20 hover:bg-green-950/40 border border-green-900/40 rounded-lg text-green-400 hover:text-green-300 transition-colors flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider font-mono shadow-sm cursor-pointer"
              title={`Signed in as ${currentUser.email}. Click to sign out.`}
            >
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="hidden md:inline font-mono">Sync ON</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="p-1.5 md:px-3 md:py-1.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-805 rounded-lg text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider font-mono shadow-sm cursor-pointer"
              title="Sign in with Google to enable cloud backups"
            >
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              <span className="hidden md:inline font-mono">Cloud Sync</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSaveLoadModal(true)}
            className="p-1.5 md:px-3 md:py-1.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-805 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider shadow-sm"
            title="Saves & Checkpoints"
          >
            <History className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden md:inline font-mono">Checkpoints</span>
          </button>
          
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-1.5 md:px-3 md:py-1.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-805 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider shadow-sm"
            title="Generative adjustments"
          >
            <Settings className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden md:inline font-mono">Core Setup</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm("Abandon current simulation timeline? Be sure to lock a checkpoint memory first.")) {
                setStarted(false);
              }
            }}
            className="p-1.5 md:px-3 md:py-1.5 bg-zinc-950/80 border border-zinc-950 hover:border-red-950 hover:bg-red-950/10 rounded-lg text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1 text-[9px] md:text-[10px] font-bold uppercase tracking-wider hover:border-red-900/40"
            title="Back to Config"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-mono font-bold">Exit</span>
          </button>

          <div className="flex flex-col items-end hidden sm:flex pl-3.5 border-l border-zinc-900 animate-fade-in">
            <span className="text-[7px] md:text-[8px] uppercase tracking-[0.2em] text-zinc-500 font-bold leading-none">POV MATRIX</span>
            <span className="text-[11px] md:text-xs font-semibold text-zinc-350 leading-normal mt-0.5">
              {playerCharacterId === '3rd_person' ? 'Omniscient' : availableCharacters.find(c => c.id === playerCharacterId)?.name}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile responsive view tabs - shows on mobile and tablet only */}
      <div className="flex lg:hidden bg-zinc-950 border border-zinc-900 rounded-xl p-1 gap-1 shrink-0">
        <button 
          type="button"
          onClick={() => setActiveMobileTab('timeline')}
          className={`flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono font-bold uppercase transition-all tracking-wider ${activeMobileTab === 'timeline' ? 'bg-red-950/40 border border-red-900/30 text-red-400 font-black' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border border-transparent'}`}
        >
          💬 Story Timeline
        </button>
        <button 
          type="button"
          onClick={() => setActiveMobileTab('dossiers')}
          className={`flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono font-bold uppercase transition-all tracking-wider ${activeMobileTab === 'dossiers' ? 'bg-red-950/40 border border-red-900/30 text-red-400 font-black' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border border-transparent'}`}
        >
          📊 Cast Dossiers
        </button>
      </div>

      {/* Simulation Content Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
        
        {/* Left Narrative Frame */}
        <div className={`lg:col-span-8 flex flex-col gap-2.5 overflow-hidden min-h-0 ${activeMobileTab === 'timeline' ? 'flex flex-1' : 'hidden lg:flex'}`}>
          {/* Narrative Panel */}
          <div className="flex-1 bg-zinc-950/50 border border-zinc-900 rounded-2xl p-4 md:p-6 overflow-y-auto relative scrollbar-thin scrollbar-thumb-zinc-900 flex flex-col min-h-0">
            <div className="absolute top-0 left-0 w-[2.5px] h-full bg-red-600/80 shadow-[0_0_12px_rgba(220,38,38,0.7)]" />
            
            <div className="space-y-4 flex-1 pr-1 font-serif text-[14px] md:text-[15px] leading-relaxed text-zinc-305">
              {messages.map((msg) => {
                if (msg.role === 'user' && !msg.isInitial) {
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end my-2"
                    >
                      <div className="bg-red-950/10 text-red-400 px-3.5 py-2 rounded-xl border border-red-900/35 text-xs font-mono shrink-0 shadow-sm max-w-[85%]">
                        &gt; {msg.content}
                      </div>
                    </motion.div>
                  );
                }
                
                if (msg.role === 'model') {
                  const parsed = parseModelResponse(msg.content);
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-3"
                    >
                      {parsed.paragraphs.map((p, i) => (
                        <p key={i} className="text-zinc-250 font-sans text-xs md:text-sm leading-relaxed">
                          {p}
                        </p>
                      ))}
                    </motion.div>
                  );
                }
                return null;
              })}

              {loading && (
                <div className="flex items-center gap-2 py-3 text-red-500 font-mono text-[10px] md:text-xs tracking-widest uppercase animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  COMPILING TIMELINE OUTCOME...
                </div>
              )}
              
              {error && (
                <div className="space-y-3">
                  <div className="bg-red-950/10 border border-red-900/35 text-red-400 p-4 rounded-xl text-xs font-mono leading-relaxed shadow-sm">
                    <span className="font-bold block mb-1 text-red-500">[TIMELINE FAULT]</span>
                    {error}
                  </div>
                  {provider === 'openrouter' && (
                    <div className="bg-zinc-950/60 border border-zinc-900 p-4 rounded-xl text-xs space-y-3">
                      <p className="text-zinc-400 leading-normal font-sans">
                        Your active OpenRouter connection failed. You can switch instantly to the secure, free server-integrated **Gemini Core** to keep your current progress and continue playing!
                      </p>
                      <div className="flex flex-wrap gap-2 text-[10px] font-mono font-bold uppercase">
                        <button
                          type="button"
                          onClick={handleSwitchToGeminiAndResume}
                          className="px-3 py-2 bg-red-950/60 hover:bg-red-900/50 border border-red-900/40 hover:text-white text-red-400 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          ⚡ Switch to Gemini & Resume Path
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSettings(true)}
                          className="px-3 py-2 bg-zinc-900 hover:bg-zinc-805 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                        >
                          ⚙️ Add Own Key
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div ref={endOfMessagesRef} />
            </div>
          </div>

          {/* Choices Controller */}
          {(!loading && parsedRecent && parsedRecent.options.length > 0) && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0 pr-1"
            >
              {parsedRecent.options.map((opt, i) => {
                const colors = [
                  "text-red-500",
                  "text-red-400",
                  "text-red-300"
                ];
                const labelColor = colors[i % colors.length];

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleChoice(opt.text)}
                    className="bg-zinc-950 border border-zinc-900 hover:bg-zinc-900/60 hover:border-zinc-850 p-2 text-left transition-all duration-200 flex flex-col gap-0.5 active:translate-y-[1px] group min-h-[44px] justify-center"
                  >
                    <span className={`block text-[8px] font-mono font-extrabold uppercase tracking-wider ${labelColor} group-hover:text-red-400`}>
                      [PATH {opt.num}]
                    </span>
                    <p className="text-[11px] text-zinc-400 leading-tight font-sans line-clamp-2">{opt.text}</p>
                  </button>
                );
              })}
            </motion.div>
          )}

          {/* Console Custom Input - Rendered beautifully right under Choices within Left Column */}
          <div className="bg-zinc-950/90 border border-zinc-900 rounded-xl p-2 shrink-0 shadow-inner">
            <form onSubmit={handleCustomChoice} className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold text-zinc-500 px-1 hidden sm:inline-block uppercase">[CUSTOM INTERACTION]</span>
              <div className="flex-1 h-9 bg-zinc-950 border border-zinc-900 rounded-lg px-3 flex items-center shadow-inner hover:border-zinc-800 transition-colors">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Type actions, requests or custom dialogue directly..."
                  className="w-full bg-transparent text-zinc-205 text-xs italic placeholder:text-zinc-650 focus:outline-none"
                />
              </div>
              <button 
                type="submit"
                disabled={!customInput.trim() || loading}
                className="w-9 h-9 bg-red-650 hover:bg-red-700 text-white rounded-lg flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Section: Character Status (purely sidebar telemetry now, fits full height on desktop) */}
        <div className={`lg:col-span-4 flex flex-col gap-3 overflow-hidden min-h-0 ${activeMobileTab === 'dossiers' ? 'flex flex-1' : 'hidden lg:flex'}`}>
          <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
            <h2 className="text-xs font-display font-bold uppercase tracking-widest text-zinc-500 font-mono pb-2 border-b border-zinc-900 flex justify-between items-center">
              <span>Dossier Telemetry</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-red-950/50 border border-red-900/30 text-red-400 font-bold uppercase rounded font-mono animate-pulse">LOCKED STATUS</span>
            </h2>
            
            <div className="space-y-3.5 flex-1 overflow-y-auto pr-0.5">
              {/* Dynamic status cards */}
              {parsedRecent && parsedRecent.characterStates && parsedRecent.characterStates.map((charState: CharacterState, idx) => {
                const matchedBio = availableCharacters.find(c => c.name.toLowerCase() === charState.name.toLowerCase() || charState.name.toLowerCase().includes(c.name.toLowerCase()));
                return (
                  <div key={idx} className="bg-zinc-900/40 border border-zinc-900/60 p-3 rounded-xl space-y-2 transition-all hover:border-red-950/65 animate-fade-in">
                    <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase">
                      {matchedBio && (
                        <div className="shrink-0">
                          {renderCharacterAvatarIcon(matchedBio, "w-8 h-8 text-[10px]")}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-zinc-200 font-display font-medium truncate leading-snug">{charState.name}</span>
                        {matchedBio ? (
                          <span className="text-[9px] text-zinc-500 font-sans mt-0.5 normal-case font-normal truncate leading-none">{matchedBio.shortDescription}</span>
                        ) : (
                          <span className="text-[9px] text-zinc-650 font-mono mt-0.5 lowercase font-normal truncate leading-none">External Agent Vector</span>
                        )}
                      </div>
                      <span className="text-red-500 font-mono text-[10px] shrink-0 bg-red-950/20 border border-red-900/10 px-1 py-0.5 rounded">
                        {charState.arousal}%
                      </span>
                    </div>
                    
                    <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0, charState.arousal))}%` }}
                        transition={{ duration: 0.8 }}
                        className="h-full bg-red-650 rounded-full shadow-[0_0_8px_rgba(220,38,38,0.5)]"
                      ></motion.div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {charState.tags.map((tag, tIdx) => (
                        <span key={tIdx} className="px-1.5 py-0.5 bg-zinc-950 border border-zinc-900/50 text-[8px] rounded font-mono font-medium text-zinc-500 uppercase tracking-tight">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Fallback if no states parsed yet */}
              {(!parsedRecent || !parsedRecent.characterStates) && availableCharacters.filter(c => activeCharacterIds.includes(c.id)).map(char => (
                <div key={char.id} className="bg-zinc-900/20 border border-zinc-900/30 p-3 rounded-xl space-y-2 opacity-50 grayscale transition-all">
                  <div className="flex items-center gap-2.5 text-xs font-bold uppercase">
                    <div className="shrink-0">
                      {renderCharacterAvatarIcon(char, "w-8 h-8 text-[10px]")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-400 font-display font-medium truncate block leading-none">{char.name}</span>
                      <span className="text-[9px] text-zinc-650 font-mono tracking-wide block mt-1">Awaiting sync...</span>
                    </div>
                    <span className="text-zinc-600 font-mono text-[10px] shrink-0 border border-zinc-900 px-1 py-0.5 rounded">{char.startingArousal || 0}%</span>
                  </div>
                  <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                    <div className="h-full bg-zinc-805" style={{ width: `${char.startingArousal || 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="flex justify-between items-center text-[10px] sm:text-xs text-zinc-600 uppercase tracking-widest font-bold shrink-0">
        <div>Engine Build: 1.0.5-EROS</div>
        <div className="flex gap-4 sm:gap-6">
          <span className="hidden sm:inline-block">Mode: {gameMode === 'free_will' ? 'Free Will' : 'Standard'}</span>
          <span className="hidden sm:inline-block">Visuals: Explicit Narrative</span>
          <span>Status: ACTIVE</span>
        </div>
      </footer>

      {/* Modal for Save/Load Game */}
      {showSaveLoadModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-xl w-full space-y-5 relative shadow-2xl text-left">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-red-500" />
                <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100">Eros Memory Drive</h3>
              </div>
              <button onClick={() => setShowSaveLoadModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
            </div>

            {/* Cloud Deck / Firebase State Controller */}
            <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentUser ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-350">
                    {currentUser ? 'Cloud Sync Online' : 'Local Only Mode'}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {currentUser ? `Synced: ${currentUser.email}` : 'Sign in to access secure cloud saves & custom characters across devices'}
                </p>
              </div>

              {currentUser ? (
                <button
                  onClick={() => signOut(auth)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-mono font-bold uppercase transition-all shrink-0 cursor-pointer"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => signInWithPopup(auth, googleProvider)}
                  className="px-3 py-1.5 bg-red-650/15 hover:bg-red-600/20 border border-red-900/50 hover:border-red-500 text-red-400 hover:text-red-300 rounded-lg text-xs font-mono font-bold uppercase transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Connect Google
                </button>
              )}
            </div>

            {/* Save current game action */}
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Save Current State</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter save slot name..."
                  className="flex-1 bg-zinc-905 border border-zinc-805 p-2.5 rounded-lg text-zinc-300 text-sm outline-none focus:border-red-900 placeholder:text-zinc-650"
                  value={saveSlotName}
                  onChange={(e) => setSaveSlotName(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (!saveSlotName.trim()) return;
                    handleSaveGame(saveSlotName);
                  }}
                  disabled={!saveSlotName.trim()}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs uppercase tracking-wide disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Code</span>
                </button>
              </div>
            </div>

            {/* Save Slots List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Memory Slots ({saveSlots.length})</h4>
              <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {saveSlots.length === 0 ? (
                  <div className="text-center py-6 text-xs text-zinc-650 italic">No saved states found. Create one to lock your custom path.</div>
                ) : (
                  saveSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="bg-zinc-950/40 hover:bg-zinc-955 border border-zinc-800/80 p-3 rounded-xl flex items-center justify-between gap-4 transition-all"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-zinc-200 truncate">{slot.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-750 text-zinc-450 rounded uppercase font-bold shrink-0 font-mono">
                            {slot.messages.length > 0 ? `${slot.messages.length} steps` : 'Setup Preset'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500 font-mono">
                          <span>{slot.timestamp}</span>
                          <span>•</span>
                          <span className="capitalize">{slot.provider || 'gemini'}</span>
                          <span>•</span>
                          <span className="lowercase">{slot.gameMode === 'free_will' ? 'free will' : 'standard'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleLoadGame(slot)}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white font-bold rounded-lg text-xs uppercase tracking-wide transition-colors"
                        >
                          Load
                        </button>
                        <button
                          onClick={(e) => handleDeleteSlot(slot.id, e)}
                          className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-red-900 hover:bg-red-950/10 text-zinc-500 hover:text-red-400 rounded-lg transition-colors"
                          title="Delete Save"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Settings / API Core */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-5 relative shadow-2xl text-left">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-red-500" />
                <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100 font-mono">Generative Cores</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
            </div>

            <div className="space-y-4">
              {/* AI Gateway Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Gateway Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setProvider('gemini')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      provider === 'gemini'
                        ? 'bg-zinc-800 border-red-500 text-zinc-100'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-bold text-xs uppercase block">Gemini Core</span>
                    <span className="text-[10px] text-zinc-500">Free, fast default server-side API.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvider('openrouter')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      provider === 'openrouter'
                        ? 'bg-zinc-800 border-red-500 text-zinc-100'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-bold text-xs uppercase block">OpenRouter API</span>
                    <span className="text-[10px] text-zinc-500">Unlock MythoMax, Llama, DeepSeek.</span>
                  </button>
                </div>
              </div>

              {provider === 'openrouter' && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800"
                >
                  {/* Model Select */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">OpenRouter Model</label>
                    <select
                      className="w-full bg-zinc-900 border border-zinc-800 p-2 text-zinc-300 rounded-lg text-xs outline-none focus:border-red-900"
                      value={openRouterModel}
                      onChange={(e) => setOpenRouterModel(e.target.value)}
                    >
                      <option value="deepseek/deepseek-chat">DeepSeek V3 (Fast & Smart)</option>
                      <option value="gryphe/mythomax-l2-13b">MythoMax L2 13B (Supreme Fiction & Roleplay)</option>
                      <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (High Intelligence)</option>
                      <option value="liquid/lfm-40b">Liquid LFM 40B (Fluid Output)</option>
                      <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (Fallback Core)</option>
                    </select>
                  </div>

                  {/* API Key Override */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Personal OpenRouter Key</label>
                      <span className="text-[9px] text-zinc-650 font-mono">(Optional)</span>
                    </div>
                    <input
                      type="password"
                      placeholder="sk-or-v1-..."
                      className="w-full bg-zinc-900 border border-zinc-800 p-2 text-zinc-300 text-xs outline-none font-mono focus:border-red-900"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                    />
                    <p className="text-[9px] text-zinc-500 leading-normal">
                      Overrides the server-side placeholder key. Stored only in local browser memory. Leave blank to fallback to server environment key if configured.
                    </p>
                  </div>
                </motion.div>
              )}

              {provider === 'gemini' && (
                <div className="p-3 bg-zinc-950/30 border border-zinc-855 rounded-xl text-xs text-zinc-500 leading-relaxed">
                  Uses the secure server-integrated Google **Gemini 2.5 Flash** model with optimal safety filters bypassed for explicit adult creative contexts. Under limit conditions, toggle OpenRouter.
                </div>
              )}
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold p-3 rounded-xl hover:shadow-lg transition-colors text-xs uppercase tracking-widest"
            >
              Apply Core Configurations
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Toast Notifications */}
      {toastNotify && (
        <div key="toast-banner" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full max-w-sm">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`pointer-events-auto p-4 rounded-xl border shadow-xl flex items-start gap-3 backdrop-blur-md ${
              toastNotify.isError 
                ? 'bg-zinc-950/90 border-red-900/50 text-red-200' 
                : 'bg-zinc-950/90 border-red-500/30 text-zinc-100'
            }`}
          >
            <div className="shrink-0 pt-0.5">
              {toastNotify.isError ? (
                <div className="w-4 h-4 rounded-full bg-red-950 border border-red-500 flex items-center justify-center font-bold text-[9px] text-red-500 font-mono">!</div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-red-950 border border-red-500 flex items-center justify-center font-bold text-[9px] text-red-500 font-mono">✓</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider font-mono">
                {toastNotify.isError ? 'System Warning' : 'Simulation Update'}
              </div>
              <p className="text-[12px] text-zinc-400 mt-1 leading-snug">{toastNotify.message}</p>
            </div>
            <button 
              onClick={() => setToastNotify(null)}
              className="text-zinc-650 hover:text-zinc-400 transition-colors shrink-0 text-xs font-mono font-bold cursor-pointer"
            >
              ×
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

