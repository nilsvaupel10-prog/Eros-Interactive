import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Loader2, Play, Users, Plus, X, Brain, Save, History, Settings, Trash2, HelpCircle, Sliders, Upload, Camera, MessageSquare, Flame, Volume2, VolumeX, UserPlus, Info, RefreshCcw, Download, Signal, SignalLow, ThumbsUp, ThumbsDown, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, StoryState, CharacterDefinition, GameMode, CharacterState, SaveSlot } from './types';
import { parseModelResponse } from './utils';
import { defaultCharacters } from './defaultData';
import { defaultScenarios, ScenarioPreset } from './scenariosData';

// Firebase Integrations
import { db, auth, googleProvider, handleFirestoreError, OperationType, testConnection } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const ReactingAvatarSVG = ({ name, arousal }: { name: string; arousal: number }) => {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hue = (hash * 137.508) % 360;
  const isHigh = arousal >= 66;
  const isMid = arousal >= 31 && arousal < 66;
  const eyeHeight = isHigh ? 1.5 : isMid ? 3 : 5;
  const blushOpacity = Math.min(0.9, arousal / 110);
  
  let mouthPath = "M 24 33 Q 30 35 36 33";
  if (isHigh) {
    mouthPath = "M 24 32 Q 30 38 36 32 Z";
  } else if (isMid) {
    mouthPath = "M 25 33 Q 30 36 35 33";
  }

  const rotation = isHigh ? 3 : isMid ? -2 : 0;

  return (
    <svg 
      viewBox="0 0 60 60" 
      className="w-full h-full rounded-md border border-zinc-800"
      style={{
        background: `radial-gradient(circle, hsl(${hue}, 45%, 15%) 0%, #09090b 100%)`,
        boxShadow: arousal > 75 ? `0 0 10px hsl(${hue}, 80%, 40%)` : 'none'
      }}
    >
      <g transform={`rotate(${rotation} 30 30)`}>
        <circle cx="30" cy="28" r="18" fill="#111113" stroke={`hsl(${hue}, 40%, 30%)`} strokeWidth="1" />
        {arousal > 20 && (
          <>
            <circle cx="21" cy="29" r="4" fill="#f43f5e" opacity={blushOpacity} style={{ filter: 'blur(1px)' }} />
            <circle cx="39" cy="29" r="4" fill="#f43f5e" opacity={blushOpacity} style={{ filter: 'blur(1px)' }} />
          </>
        )}
        {isHigh ? (
          <>
            <path d="M 17 24 Q 21 21 25 24" stroke={`hsl(${hue}, 90%, 75%)`} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M 35 24 Q 39 21 43 24" stroke={`hsl(${hue}, 90%, 75%)`} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <circle cx="21" cy="25" r="1" fill="#fff" opacity="0.8" />
            <circle cx="39" cy="25" r="1" fill="#fff" opacity="0.8" />
          </>
        ) : isMid ? (
          <>
            <ellipse cx="21" cy="23" rx="3.5" ry={eyeHeight} fill={`hsl(${hue}, 80%, 70%)`} />
            <ellipse cx="39" cy="23" rx="3.5" ry={eyeHeight} fill={`hsl(${hue}, 80%, 70%)`} />
            <circle cx="21" cy="23" r="1.5" fill="#000" />
            <circle cx="39" cy="23" r="1.5" fill="#000" />
          </>
        ) : (
          <>
            <circle cx="21" cy="23" r="3.5" fill={`hsl(${hue}, 80%, 65%)`} />
            <circle cx="39" cy="23" r="3.5" fill={`hsl(${hue}, 80%, 65%)`} />
            <circle cx="21" cy="23" r="1.5" fill="#000" />
            <circle cx="39" cy="23" r="1.5" fill="#000" />
            <circle cx="22" cy="22" r="0.8" fill="#fff" />
            <circle cx="40" cy="22" r="0.8" fill="#fff" />
          </>
        )}
        <path d="M 16 20 Q 21 18 26 21" stroke="#4b5563" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M 34 21 Q 39 18 44 20" stroke="#4b5563" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={mouthPath} stroke={`hsl(${hue}, 85%, 65%)`} strokeWidth="1.5" fill={isHigh ? `hsl(${hue}, 80%, 30%)` : "none"} strokeLinecap="round" />
        {arousal > 80 && (
          <path d="M 42 16 Q 41 21 40 24" stroke="#60a5fa" strokeWidth="1" fill="none" opacity="0.75" />
        )}
      </g>
    </svg>
  );
};

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

  // New Adjustable Options before Game Start
  const [consequences, setConsequences] = useState<boolean>(true);
  const [arousalSpeed, setArousalSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [narrativeTone, setNarrativeTone] = useState<'romantic' | 'smutty' | 'kinky' | 'story-driven'>('smutty');
  const [complianceLevel, setComplianceLevel] = useState<'compliant' | 'normal' | 'resistant' | 'defiant'>('normal');
  const [arousalDecay, setArousalDecay] = useState<boolean>(false);
  const [autoSaveFrequency, setAutoSaveFrequency] = useState<'off' | 'every-turn' | 'every-5-mins'>('every-turn');
  const [proseLength, setProseLength] = useState(60); // 0 to 100
  const [dialogueAmount, setDialogueAmount] = useState(50); // 0 to 100
  const [charMemories, setCharMemories] = useState<Record<string, string[]>>({});

  const [modelSettings, setModelSettings] = useState<{ temperature: number; topP: number }>({
    temperature: 0.9,
    topP: 1.0
  });
  
  // API provider state
  const [provider, setProvider] = useState<'gemini' | 'openrouter' | 'mock'>('gemini');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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
      if (stored && stored.trim() !== '') {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse OpenRouter models from localStorage', e);
    }
    return [
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Fast & Smart)" },
      { id: "gryphe/mythomax-l2-13b", name: "MythoMax L2 13B (Supreme Fiction & Roleplay)" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (High Intelligence)" },
      { id: "google/gemini-pro-1.5", name: "Gemini 3.1 Pro (High Intelligence)" },
      { id: "google/gemini-flash-1.5", name: "Gemini 3.5 Flash (High Speed)" },
      { id: "google/gemini-flash-1.5-8b", name: "Gemini Flash Lite (Fallback)" }
    ];
  });
  const [customModelId, setCustomModelId] = useState('');
  const [customModelLabel, setCustomModelLabel] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchSuccessMessage, setFetchSuccessMessage] = useState('');
  const [currentChoiceIndex, setCurrentChoiceIndex] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showDossierManager, setShowDossierManager] = useState(false);
  const [lastUsedModel, setLastUsedModel] = useState<string | null>(null);
  const handleRateMessage = (msgId: string, rating: -1 | 0 | 1) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, rating } : m));
  };

  const handleUpdateMemory = (charId: string, memoryText: string, index?: number) => {
    setCharMemories(prev => {
      const existing = prev[charId] || [];
      const updated = [...existing];
      if (index !== undefined) {
        if (memoryText.trim() === '') {
          updated.splice(index, 1);
        } else {
          updated[index] = memoryText;
        }
      } else if (memoryText.trim() !== '') {
        updated.push(memoryText);
      }
      return { ...prev, [charId]: updated };
    });
  };

  // Import modal state
  const [showImport, setShowImport] = useState(false);
  const [importDef, setImportDef] = useState('');
  const [importName, setImportName] = useState('');
  const [importShort, setImportShort] = useState('');

  // Character Creator State
  const [showCreator, setShowCreator] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [creatorShort, setCreatorShort] = useState('');
  const [creatorTags, setCreatorTags] = useState('');
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [creatorClothing, setCreatorClothing] = useState<string>('casual');
  const [creatorSliders, setCreatorSliders] = useState({
    assertiveness: 50,
    sociability: 50,
    temperament: 50,
    height: 50,
    athleticism: 50,
    curviness: 55,
    dickSize: 0, // 0 means female default/None
    willpower: 50,
    sensuality: 50,
    compliance: 50,
    flirtatiousness: 50,
    kinkiness: 55,
    jealousy: 40,
    exhibitionism: 50,
    eloquence: 50,
    playfulness: 50,
    curiosity: 60,
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
  const [memoryEditingCharId, setMemoryEditingCharId] = useState<string | null>(null);
  
  // Game session dynamic trackers
  const [stamina, setStamina] = useState(100);
  const [willpowerPool, setWillpowerPool] = useState(100);
  const [stance, setStance] = useState<'verbal' | 'tactile'>('verbal');
  const [climaxTriggered, setClimaxTriggered] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showArousalOverlay, setShowArousalOverlay] = useState(false);
  const [lastArousalLevel, setLastArousalLevel] = useState(0);

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  const restoreLocalData = () => {
    const storedAutoSave = localStorage.getItem('eros_auto_save_frequency');
    if (storedAutoSave) setAutoSaveFrequency(storedAutoSave as any);

    const storedModelSettings = localStorage.getItem('eros_model_settings');
    if (storedModelSettings) {
      try {
        setModelSettings(JSON.parse(storedModelSettings));
      } catch (e) {}
    }

    try {
      const stored = localStorage.getItem('eros_save_slots');
      if (stored && stored.trim() !== '') {
        setSaveSlots(JSON.parse(stored));
      } else {
        setSaveSlots([]);
      }
    } catch (e) {
      console.error('Failed to parse save slots', e);
      setSaveSlots([]);
    }

    try {
      const storedChars = localStorage.getItem('eros_custom_characters');
      if (storedChars && storedChars.trim() !== '') {
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
      setAvailableCharacters(defaultCharacters);
      setActiveCharacterIds(defaultCharacters.map(c => c.id));
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
          customApiKey: data.customApiKey || '',
          options: data.options || undefined
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
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('--- EROS PWA --- Install prompt deferred.');
    };

    const handleOnlineStatus = () => setIsOnline(true);
    const handleOfflineStatus = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);

    const checkCon = async () => {
      const ok = await testConnection();
      setDbConnected(ok);
    };
    checkCon();

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

    return () => {
      unsub();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOfflineStatus);
    };
  }, []);

  // Auto-save logic
  const lastAutoSaveRef = useRef<number>(0);
  useEffect(() => {
    if (started && !loading && messages.length > 1 && autoSaveFrequency !== 'off') {
      const now = Date.now();
      let shouldSave = false;
      
      if (autoSaveFrequency === 'every-turn') {
        // Save if the last message is from the model and we haven't saved this turn
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'model' && lastAutoSaveRef.current < parseInt(lastMsg.id)) {
          shouldSave = true;
          lastAutoSaveRef.current = parseInt(lastMsg.id);
        }
      } else if (autoSaveFrequency === 'every-5-mins') {
        // Save if 5 minutes have passed since last save
        if (now - lastAutoSaveRef.current > 5 * 60 * 1000) {
          shouldSave = true;
          lastAutoSaveRef.current = now;
        }
      }

      if (shouldSave) {
        handleSaveGame(`Auto-Save: ${new Date().toLocaleTimeString()}`);
      }
    }
  }, [messages, loading, started, autoSaveFrequency]);

  // Auto-expire toast notifications after 4 seconds
  useEffect(() => {
    if (toastNotify) {
      const timer = setTimeout(() => {
        setToastNotify(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastNotify]);

  useEffect(() => {
    localStorage.setItem('eros_auto_save_frequency', autoSaveFrequency);
  }, [autoSaveFrequency]);

  useEffect(() => {
    localStorage.setItem('eros_model_settings', JSON.stringify(modelSettings));
  }, [modelSettings]);

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
      customApiKey,
      options: {
        consequences,
        arousalSpeed,
        narrativeTone,
        complianceLevel,
        arousalDecay
      }
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
    if (slot.options) {
      setConsequences(slot.options.consequences !== undefined ? slot.options.consequences : true);
      setArousalSpeed(slot.options.arousalSpeed || 'normal');
      setNarrativeTone(slot.options.narrativeTone || 'smutty');
      setComplianceLevel(slot.options.complianceLevel || 'normal');
      setArousalDecay(slot.options.arousalDecay || false);
    }
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


  // Handles inline generation for any preset or custom character already on the selector grid
  const handleTriggerInlineSynthesizeAvatar = async (char: CharacterDefinition) => {
    setInlineSynthingId(char.id);
    const lookPrompt = `${char.name}, a detailed adult gaming portrait avatar, ${char.shortDescription || 'gorgeous character'}`;
    
    try {
      const resp = await fetch('/api/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: lookPrompt, provider, customApiKey })
      });
      
      const textResponse = await resp.text();
      if (!textResponse || textResponse.trim() === '') {
        throw new Error('Server returned an empty response for avatar generation');
      }
      const data = JSON.parse(textResponse);
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

  const generateDefinitionFromSliders = (name: string, description: string, s: typeof creatorSliders, clothing: string) => {
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
- Current Attire: ${clothing}
- Genital Blueprint / Dick Size: ${dickDescription}

Personality Framework Sliders:
- Dominance factor: ${s.assertiveness}% (Scale: 0%=Submissive/Shy, 100%=Dominant/Commanding)
- Sociability index: ${s.sociability}% (Scale: 0%=Introverted/Reserved, 100%=Boisterous/Extroverted)
- Mood temperament: ${s.temperament}% (Scale: 0%=Sweet/Composed/Patient, 100%=Aggressive/Volatile/Hot-headed)
- Willpower resilience: ${s.willpower}% (Scale: 0%=Fragile/Easily manipulated, 100%=Ironclad/Indomitable)
- Sensuality drive: ${s.sensuality}% (Scale: 0%=Prude/Modest, 100%=Hyper-sexual/Uninhibited)
- Compliance lean: ${s.compliance}% (Scale: 0%=Rebellious/Defiant, 100%=Obedient/Servile)
- Flirtatiousness: ${s.flirtatiousness}% (Scale: 0%=Stiff/Businesslike, 100%=Teasing/Playful)
- Kinkiness: ${s.kinkiness}% (Scale: 0%=Vanilla/Traditional, 100%=Experimental/Boundless)
- Jealousy potential: ${s.jealousy}% (Scale: 0%=Compersive/Sharing, 100%=Possessive/Vindictive)
- Exhibitionism: ${s.exhibitionism}% (Scale: 0%=Shy/Private, 100%=Bold/Public)
- Eloquence/Vocabulary: ${s.eloquence}% (Scale: 0%=Vulgar/Short-spoken, 100%=Articulate/Sophisticated)
- Playfulness: ${s.playfulness}% (Scale: 0%=Serious/Grim, 100%=Mischievous/Fun-loving)
- Curiosity/Openness: ${s.curiosity}% (Scale: 0%=Set in ways, 100%=Eager for new experiences)

Behavioral Response Guidelines:
- Act strictly according to these custom slider properties. 
- A character with high dominance (${s.assertiveness}%) will actively direct positions, tease possessively, use commanding dialogue, and refuse to subserve.
- A character with high willpower (${s.willpower}%) will put up a significant verbal or psychological fight before submitting, creating intense tension.
- If possessing a dick (${s.dickSize > 0 ? 'Yes: ' + dickDescription : 'No'}), emphasize their bulge shape under sweatpants, their arousal, and physical depth in all explicit interactive paths.`;
  };

  const handleCreateCharacter = () => {
    if (!creatorName.trim()) return;
    
    const targetId = editingCharacterId || (creatorName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4));
    const customDef = generateDefinitionFromSliders(creatorName.trim(), creatorShort.trim(), creatorSliders, creatorClothing);
    
    // Process tags
    const tagsArray = creatorTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    const newChar: CharacterDefinition = {
      id: targetId,
      name: creatorName.trim(),
      shortDescription: creatorShort.trim() || "Custom Simulation Vector",
      definition: customDef,
      tags: tagsArray,
      personality: {
        assertiveness: creatorSliders.assertiveness,
        sociability: creatorSliders.sociability,
        temperament: creatorSliders.temperament,
        willpower: creatorSliders.willpower,
        sensuality: creatorSliders.sensuality,
        compliance: creatorSliders.compliance,
        flirtatiousness: creatorSliders.flirtatiousness,
        kinkiness: creatorSliders.kinkiness,
        jealousy: creatorSliders.jealousy,
        exhibitionism: creatorSliders.exhibitionism,
        eloquence: creatorSliders.eloquence,
        playfulness: creatorSliders.playfulness,
        curiosity: creatorSliders.curiosity,
      },
      body: {
        height: creatorSliders.height,
        athleticism: creatorSliders.athleticism,
        curviness: creatorSliders.curviness,
        clothing: creatorClothing
      },
      dickSize: creatorSliders.dickSize,
      avatarUrl: creatorAvatarUrl || undefined,
      startingArousal: creatorStartingArousal
    };

    addAndPersistCustomCharacter(newChar);
    
    // Reset state
    setShowCreator(false);
    setEditingCharacterId(null);
    setCreatorName('');
    setCreatorShort('');
    setCreatorTags('');
    setCreatorStartingArousal(20);
    setCreatorAvatarUrl('');
    setCreatorAvatarPrompt('');
    setAvatarSynthError('');
    setCreatorClothing('casual');
    setCreatorSliders({
      assertiveness: 50,
      sociability: 50,
      temperament: 50,
      height: 50,
      athleticism: 50,
      curviness: 55,
      dickSize: 0,
      willpower: 50,
      sensuality: 50,
      compliance: 50,
      flirtatiousness: 50,
      kinkiness: 55,
      jealousy: 40,
      exhibitionism: 50,
      eloquence: 50,
      playfulness: 50,
      curiosity: 60,
    });
  };

  const handleEditCharacter = (char: CharacterDefinition) => {
    setEditingCharacterId(char.id);
    setCreatorName(char.name);
    setCreatorShort(char.shortDescription);
    setCreatorTags(char.tags?.join(', ') || '');
    setCreatorStartingArousal(char.startingArousal || 20);
    setCreatorAvatarUrl(char.avatarUrl || '');
    setCreatorClothing(char.body?.clothing || 'casual');
    setCreatorSliders({
      assertiveness: char.personality?.assertiveness ?? 50,
      sociability: char.personality?.sociability ?? 50,
      temperament: char.personality?.temperament ?? 50,
      height: char.body?.height ?? 50,
      athleticism: char.body?.athleticism ?? 50,
      curviness: char.body?.curviness ?? 55,
      dickSize: char.dickSize ?? 0,
      willpower: char.personality?.willpower ?? 50,
      sensuality: char.personality?.sensuality ?? 50,
      compliance: char.personality?.compliance ?? 50,
      flirtatiousness: char.personality?.flirtatiousness ?? 50,
      kinkiness: char.personality?.kinkiness ?? 55,
      jealousy: char.personality?.jealousy ?? 40,
      exhibitionism: char.personality?.exhibitionism ?? 50,
      eloquence: char.personality?.eloquence ?? 50,
      playfulness: char.personality?.playfulness ?? 50,
      curiosity: char.personality?.curiosity ?? 60,
    });
    setShowCreator(true);
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
      
      const textResponse = await response.text();
      if (!textResponse || textResponse.trim() === '') {
        throw new Error('OpenRouter API returned an empty model list');
      }
      const data = JSON.parse(textResponse);
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

  useEffect(() => {
    if (voiceEnabled && messages.length > 0 && !loading) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'model') {
        const parsed = parseModelResponse(lastMsg.content);
        const textToRead = parsed.paragraphs.join(' ');
        
        // Use Gemini TTS proxy if possible, fallback to browser
        const speakText = async () => {
          try {
            const resp = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: textToRead, voice: 'en-US-Standard-C' })
            });
            if (!resp.ok) throw new Error('TTS proxy failed');
            const textResponse = await resp.text();
            if (!textResponse || textResponse.trim() === '') {
              throw new Error('Server returned an empty response for TTS');
            }
            const data = JSON.parse(textResponse);
            if (data.audio) {
              const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
              audio.play();
            } else {
              throw new Error('No audio in response');
            }
          } catch (err) {
            console.warn('Falling back to browser TTS:', err);
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(textToRead);
              utterance.rate = 1.0;
              window.speechSynthesis.speak(utterance);
            }
          }
        };
        speakText();
      }
    }
  }, [messages, voiceEnabled, loading]);

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
      characters: availableCharacters
        .filter(c => activeCharacterIds.includes(c.id))
        .map(c => ({
          ...c,
          startingArousal: charStartingArousals[c.id] !== undefined ? charStartingArousals[c.id] : (c.startingArousal ?? 20)
        })),
      playerCharacterId,
      gameMode,
      scenarioDescription: scenarioInput,
      options: {
        consequences,
        arousalSpeed,
        narrativeTone,
        complianceLevel,
        arousalDecay,
        proseLength,
        dialogueAmount
      },
      charMemories
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
          customApiKey,
          modelSettings
        })
      });
      
      const textResponse = await resp.text();
      if (!textResponse || textResponse.trim() === '') {
        throw new Error('Server returned an empty response for chat kickoff');
      }
      const data = JSON.parse(textResponse);
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch');
      
      if (data.model) setLastUsedModel(data.model);
      
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

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('User closed the popup.');
      } else {
        console.error('Sign-in error:', error);
        setToastNotify({ message: 'Sign-in failed. Please try again.', isError: true });
      }
    }
  };

  const handleChoice = async (optionText: string, isReroll: boolean = false) => {
    if (loading) return;
    
    let newContext = [...messages];
    if (!isReroll) {
      const newUserMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: optionText
      };
      newContext = [...messages, newUserMsg];
      setMessages(newContext);
      
      // Consume Stamina/Willpower for intense actions
      const isIntense = optionText.length > 40 || optionText.match(/(force|command|intense|primal|dirty|hard|climax)/i);
      if (isIntense) {
        setStamina(prev => Math.max(0, prev - 5));
        setWillpowerPool(prev => Math.max(0, prev - 3));
      } else {
        setStamina(prev => Math.min(100, prev + 2));
      }
    } else {
      // For reroll, we remove the last model message and regenerate
      if (messages[messages.length - 1].role === 'model') {
        newContext = messages.slice(0, -1);
        setMessages(newContext);
      }
    }

    setLoading(true);
    setError('');
    
    const context = {
      characters: availableCharacters
        .filter(c => activeCharacterIds.includes(c.id))
        .map(c => ({
          ...c,
          startingArousal: charStartingArousals[c.id] !== undefined ? charStartingArousals[c.id] : (c.startingArousal ?? 20)
        })),
      playerCharacterId,
      gameMode,
      scenarioDescription: scenarioInput,
      options: {
        consequences,
        arousalSpeed,
        narrativeTone,
        complianceLevel,
        arousalDecay,
        proseLength,
        dialogueAmount
      },
      charMemories
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
          customApiKey,
          sessionStats: { stamina, willpower: willpowerPool, stance },
          modelSettings
        })
      });
      
      const textResponse = await resp.text();
      if (!textResponse || textResponse.trim() === '') {
        throw new Error('Server returned an empty response for chat interaction');
      }
      const data = JSON.parse(textResponse);
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch');
      
      if (data.model) setLastUsedModel(data.model);
      
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

  const handleReroll = () => {
    handleChoice('', true);
  };

  const [customInput, setCustomInput] = useState('');
  
  const handleExportDossiers = () => {
    const dataStr = JSON.stringify(availableCharacters, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'eros_dossiers_export.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleExportSingleDossier = (char: CharacterDefinition) => {
    const dataStr = JSON.stringify(char, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `${char.name.toLowerCase().replace(/\s+/g, '_')}_dossier.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleBulkImportDossiers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsed.forEach(char => {
            if (char.id && char.name) {
              addAndPersistCustomCharacter(char);
            }
          });
          setToastNotify({ message: `Successfully imported ${parsed.length} dossiers!`, isError: false });
        } else if (parsed.id && parsed.name) {
          addAndPersistCustomCharacter(parsed);
          setToastNotify({ message: `Successfully imported dossier for ${parsed.name}!`, isError: false });
        }
      } catch (err) {
        setToastNotify({ message: 'Failed to import dossiers. Invalid JSON format.', isError: true });
      }
    };
    reader.readAsText(file);
  };

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
      characters: availableCharacters
        .filter(c => activeCharacterIds.includes(c.id))
        .map(c => ({
          ...c,
          startingArousal: charStartingArousals[c.id] !== undefined ? charStartingArousals[c.id] : (c.startingArousal ?? 20)
        })),
      playerCharacterId,
      gameMode,
      scenarioDescription: scenarioInput,
      options: {
        consequences,
        arousalSpeed,
        narrativeTone,
        complianceLevel,
        arousalDecay
      }
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
          customApiKey: '',
          modelSettings
        })
      });
      
      const textResponse = await resp.text();
      if (!textResponse || textResponse.trim() === '') {
        throw new Error('Server returned an empty response for Gemini resumption');
      }
      const data = JSON.parse(textResponse);
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch');
      
      if (data.model) setLastUsedModel(data.model);
      
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
      <div className="safe-screen min-h-screen bg-[#07070a] text-zinc-300 flex items-center justify-center p-4 md:p-8 font-sans relative overflow-x-hidden selection:bg-red-900 selection:text-white">
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
                    onClick={handleSignIn}
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

            {/* Game Mode Selection */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-mono">Framework Execution Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setGameMode('standard')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-1 transition-colors relative h-full ${
                    gameMode === 'standard' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm shadow-red-950/20' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <Send className={`w-3.5 h-3.5 ${gameMode === 'standard' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Standard Sandbox
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-normal">NPC actions await your triggers. Fully controlled sandbox.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGameMode('free_will')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-1 transition-colors relative h-full ${
                    gameMode === 'free_will' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm shadow-red-950/20' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <Brain className={`w-3.5 h-3.5 ${gameMode === 'free_will' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Free Will Mode
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-normal">NPC nodes proactively drive relationship arcs autonomously.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGameMode('pornstar')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-1 transition-colors relative h-full ${
                    gameMode === 'pornstar' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm shadow-red-950/20' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <Camera className={`w-3.5 h-3.5 ${gameMode === 'pornstar' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Pornstar Simulator
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-normal">Build brand, fulfill fan direct message requests, buy custom sexy shoots.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGameMode('sexting')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-1 transition-colors relative h-full ${
                    gameMode === 'sexting' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm shadow-red-950/20' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <MessageSquare className={`w-3.5 h-3.5 ${gameMode === 'sexting' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Sexting Simulator
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-normal">Native phone texting layout. Snappy typing, emotes, raw selfies described.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGameMode('hookup')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-start gap-1 transition-colors relative h-full col-span-1 sm:col-span-2 lg:col-span-1 ${
                    gameMode === 'hookup' 
                      ? 'bg-zinc-900/90 border-red-550 text-white shadow-sm shadow-red-950/20' 
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-display font-bold text-xs flex items-center gap-1.5">
                    <Flame className={`w-3.5 h-3.5 ${gameMode === 'hookup' ? 'text-red-500' : 'text-zinc-500'}`}/> 
                    Hookup Simulator
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-normal">Immediate direct date meetups. Instant physical contacts, primal speed.</span>
                </button>
              </div>
            </div>

            {/* Adjustable Options */}
            <div className="space-y-4 bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-red-500" /> Pre-Game Adjustable Options
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Configure Rulesets</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Select: Compliance Level */}
                <div className="space-y-1.5 bg-zinc-900/20 p-3 rounded-lg border border-zinc-900/80">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Difficulty / Compliance</label>
                  <select
                    value={complianceLevel}
                    onChange={(e) => setComplianceLevel(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 p-1.5 text-zinc-300 rounded text-xs outline-none focus:border-red-900"
                  >
                    <option value="compliant">🧸 Easy (Compliant & Eager)</option>
                    <option value="normal">⚖️ Normal (Baseline Personality)</option>
                    <option value="resistant">🛑 Hard (Resistant & Skeptical)</option>
                    <option value="defiant">🔥 Extreme (Defiant & Unforgiving)</option>
                  </select>
                  <p className="text-[9px] text-zinc-500 leading-tight">Adjusts how easy characters are to seduce or manipulate.</p>
                </div>

                {/* Select: Arousal Speed */}
                <div className="space-y-1.5 bg-zinc-900/20 p-3 rounded-lg border border-zinc-900/80">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Arousal Pacing Rate</label>
                  <select
                    value={arousalSpeed}
                    onChange={(e) => setArousalSpeed(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 p-1.5 text-zinc-300 rounded text-xs outline-none focus:border-red-900"
                  >
                    <option value="slow">🐢 Slow & Sensual (Under +3% / choice)</option>
                    <option value="normal">⚖️ Balanced (Under +7% / choice)</option>
                    <option value="fast">🔥 High Intensity (Up to +15% / choice)</option>
                  </select>
                  <p className="text-[9px] text-zinc-500 leading-tight">Controls the rate at which physical sexual tension builds with actions.</p>
                </div>

                {/* Checkbox: Consequences */}
                <div className="space-y-1.5 bg-zinc-900/20 p-3 rounded-lg border border-zinc-900/80 flex items-start gap-3">
                  <input
                    id="consequences_cb"
                    type="checkbox"
                    checked={consequences}
                    onChange={(e) => setConsequences(e.target.checked)}
                    className="mt-1 accent-red-650 rounded cursor-pointer w-4 h-4 shrink-0 bg-zinc-900 border border-zinc-800"
                  />
                  <div className="space-y-0.5">
                    <label htmlFor="consequences_cb" className="text-xs font-bold text-zinc-300 cursor-pointer flex items-center gap-1 select-none">
                      Actions Have Consequences
                    </label>
                    <p className="text-[9px] text-zinc-500 leading-normal">
                      When active, choices can lead NPC characters to walk out of simulations.
                    </p>
                  </div>
                </div>

                {/* Checkbox: Arousal Decay */}
                <div className="space-y-1.5 bg-zinc-900/20 p-3 rounded-lg border border-zinc-900/80 flex items-start gap-3">
                  <input
                    id="arousalDecay_cb"
                    type="checkbox"
                    checked={arousalDecay}
                    onChange={(e) => setArousalDecay(e.target.checked)}
                    className="mt-1 accent-red-650 rounded cursor-pointer w-4 h-4 shrink-0 bg-zinc-900 border border-zinc-800"
                  />
                  <div className="space-y-0.5">
                    <label htmlFor="arousalDecay_cb" className="text-xs font-bold text-zinc-300 cursor-pointer flex items-center gap-1 select-none">
                      Arousal Decay
                    </label>
                    <p className="text-[9px] text-zinc-500 leading-normal">
                      If neglected or given boring prompts, a character's arousal will rapidly drop.
                    </p>
                  </div>
                </div>

                {/* Select: Narrative Tone */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Atmospheric Tone Focus</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'smutty', label: '🔥 Pure Smut', desc: 'Direct explicit details' },
                      { id: 'romantic', label: '✨ Romantic Build', desc: 'Sensual glances & hearts' },
                      { id: 'kinky', label: '⛓️ Kink & Dom/Sub', desc: 'Bondage, orders & play' },
                      { id: 'story-driven', label: '📖 Story-First', desc: 'Dialogue and motive plots' },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setNarrativeTone(t.id as any)}
                        className={`p-2 rounded border text-left flex flex-col items-start transition-all ${
                          narrativeTone === t.id
                            ? 'bg-zinc-900 border-red-500 text-zinc-200'
                            : 'bg-zinc-950/20 border-zinc-900 text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        <span className="font-bold text-[10px] leading-tight block">{t.label}</span>
                        <span className="text-[9px] text-zinc-500 leading-tight mt-0.5">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
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
                            <span className={`font-display font-bold text-xs ${isActive ? 'text-zinc-150 font-semibold' : 'text-zinc-550'}`}>
                              {char.name}
                            </span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              <span className="text-[7px] text-zinc-500 font-mono tracking-wider font-semibold uppercase px-1 bg-zinc-950/40 rounded border border-zinc-900/50">
                                {defaultCharacters.some(dc => dc.id === char.id) ? 'PRESET' : 'CUSTOM'}
                              </span>
                              {char.tags && char.tags.map((tag, tIdx) => (
                                <span key={tIdx} className="text-[7px] text-red-500/60 font-mono tracking-wider font-semibold uppercase px-1 bg-red-950/5 rounded border border-red-900/10">
                                  {tag}
                                </span>
                              ))}
                            </div>
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
                     <label className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono">Character Identity {editingCharacterId ? '(Editing)' : ''}</label>
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
                   <div className="space-y-1">
                     <input 
                       type="text" 
                       placeholder="Character Tags (comma separated, e.g. blonde, petite, tease)" 
                       className="w-full bg-zinc-950 border border-zinc-900 p-2.5 rounded-lg text-zinc-200 outline-none focus:border-red-900 text-[10px] font-mono"
                       value={creatorTags} onChange={e => setCreatorTags(e.target.value)}
                     />
                   </div>

                   <div className="space-y-1 p-2.5 bg-zinc-950/40 border border-zinc-855 rounded-lg">
                      <label className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono">Current Attire / Clothing</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 'Strict formal suit', 'Transparent lace lingerie', 'Short athletic sweatpants'" 
                        className="w-full bg-transparent border-none p-0 text-zinc-200 outline-none placeholder:text-zinc-700 text-xs italic"
                        value={creatorClothing} onChange={e => setCreatorClothing(e.target.value)}
                      />
                   </div>

                   {/* SLIDERS GRID */}
                   <div className="space-y-3 pt-2">
                     <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 block font-mono border-b border-zinc-850 pb-1">Personality Matrix Sliders</span>
                     
                     <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2.5 rounded-lg">
                       <div className="flex justify-between text-[10px]">
                         <span className="text-zinc-400 font-medium font-sans">Assertiveness (Dom/Sub)</span>
                         <span className="text-red-500 font-mono font-bold">{creatorSliders.assertiveness}%</span>
                       </div>
                       <input 
                         type="range" min="0" max="100" 
                         className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                         value={creatorSliders.assertiveness}
                         onChange={e => setCreatorSliders(prev => ({...prev, assertiveness: parseInt(e.target.value)}))}
                       />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {[
                          { key: 'willpower', label: 'Willpower', low: 'Fragile', high: 'Indomitable' },
                          { key: 'sensuality', label: 'Sensuality', low: 'Chaste', high: 'Lustful' },
                          { key: 'compliance', label: 'Compliance', low: 'Defiant', high: 'Servile' },
                          { key: 'flirtatiousness', label: 'Flirtiness', low: 'Cold', high: 'Teasing' },
                          { key: 'kinkiness', label: 'Kinkiness', low: 'Vanilla', high: 'Exotic' },
                          { key: 'jealousy', label: 'Jealousy', low: 'Cuckquean', high: 'Aggressive' },
                          { key: 'exhibitionism', label: 'Exhibitionism', low: 'Modest', high: 'Shame-free' },
                          { key: 'eloquence', label: 'Eloquence', low: 'Vulgar', high: 'Refined' },
                          { key: 'playfulness', label: 'Playfulness', low: 'Serious', high: 'Mischievous' },
                          { key: 'curiosity', label: 'Curiosity', low: 'Reserved', high: 'Open' }
                        ].map(s => (
                          <div key={s.key} className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2 rounded-lg">
                            <div className="flex justify-between text-[9px]">
                              <span className="text-zinc-400">{s.label}</span>
                              <span className="text-red-500 font-mono font-bold">{(creatorSliders as any)[s.key]}%</span>
                            </div>
                            <input 
                              type="range" min="0" max="100" 
                              className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                              value={(creatorSliders as any)[s.key]}
                              onChange={e => setCreatorSliders(prev => ({...prev, [s.key]: parseInt(e.target.value)}))}
                            />
                            <div className="flex justify-between text-[7px] text-zinc-650 font-mono uppercase tracking-tighter">
                               <span>{s.low}</span>
                               <span>{s.high}</span>
                            </div>
                          </div>
                        ))}
                     </div>

                     <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2 rounded-lg">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-zinc-400 font-medium font-sans">Sociability</span>
                            <span className="text-red-400 font-mono font-bold">{creatorSliders.sociability}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="100" 
                            className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                            value={creatorSliders.sociability}
                            onChange={e => setCreatorSliders(prev => ({...prev, sociability: parseInt(e.target.value)}))}
                          />
                        </div>

                        <div className="space-y-1 bg-zinc-950/40 border border-zinc-855 p-2 rounded-lg">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-zinc-400 font-medium font-sans">Temperament</span>
                            <span className="text-red-400 font-mono font-bold">{creatorSliders.temperament}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="100" 
                            className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                            value={creatorSliders.temperament}
                            onChange={e => setCreatorSliders(prev => ({...prev, temperament: parseInt(e.target.value)}))}
                          />
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
                            <div className="text-[9px] text-zinc-400 font-mono uppercase tracking-wider font-bold leading-none">Avatar Image URL</div>
                            <input
                              type="text"
                              value={creatorAvatarUrl}
                              onChange={(e) => setCreatorAvatarUrl(e.target.value)}
                              placeholder="e.g., https://example.com/image.png"
                              className="w-full bg-zinc-950 border border-zinc-850 px-2 py-1.5 text-zinc-200 text-xs rounded-lg outline-none focus:border-red-900 placeholder:text-zinc-700 font-sans"
                            />
                          </div>
                        </div>
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
                    onClick={handleSignIn}
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
                            <span className="lowercase">
                              {slot.gameMode === 'free_will' ? 'free will' : 
                               slot.gameMode === 'pornstar' ? 'pornstar sim' :
                               slot.gameMode === 'sexting' ? 'sexting sim' :
                               slot.gameMode === 'hookup' ? 'hookup sim' : 'standard'}
                            </span>
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                      <span className="text-[10px] text-zinc-500 line-clamp-1 md:line-clamp-none">Free, fast default server-side API.</span>
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
                      <span className="font-bold text-xs uppercase block">OpenRouter</span>
                      <span className="text-[10px] text-zinc-500 line-clamp-1 md:line-clamp-none">MythoMax, Llama, DeepSeek.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvider('mock')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        provider === 'mock'
                          ? 'bg-zinc-800 border-red-500 text-zinc-100'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      <span className="font-bold text-xs uppercase block text-orange-400">UI Test Mode</span>
                      <span className="text-[10px] text-zinc-500 line-clamp-1 md:line-clamp-none">No API key. Safe layouts & telemetry test.</span>
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

                {/* Narrative Style Controller */}
                <div className="space-y-3 bg-zinc-950/30 p-4 rounded-xl border border-zinc-800">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Narrative Modulation</label>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Prose Density</span>
                        <span className="text-[10px] font-mono text-red-500">{proseLength}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={proseLength} 
                        onChange={(e) => setProseLength(parseInt(e.target.value))}
                        className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[8px] uppercase text-zinc-600 font-mono">
                        <span>Concise</span>
                        <span>Descriptive</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Dialogue Focus</span>
                        <span className="text-[10px] font-mono text-red-500">{dialogueAmount}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={dialogueAmount} 
                        onChange={(e) => setDialogueAmount(parseInt(e.target.value))}
                        className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[8px] uppercase text-zinc-600 font-mono">
                        <span>Actions</span>
                        <span>Speech</span>
                      </div>
                    </div>
                  </div>
                </div>

                {provider === 'gemini' && (
                  <div className="space-y-4">
                    <div className="p-3 bg-zinc-950/30 border border-zinc-850 rounded-xl text-xs text-zinc-500 leading-relaxed">
                      Uses the secure server-integrated Google **Gemini 2.5 Flash** model with optimal safety filters bypassed for explicit adult creative contexts. Under limit conditions, toggle OpenRouter.
                    </div>
                    
                    {/* Diagnostic Summary */}
                    <div className="p-4 bg-zinc-900/20 border border-zinc-800 rounded-xl space-y-2.5 shadow-inner">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono flex items-center justify-between">
                        <span>Engine Diagnostics</span>
                        <span className="text-[8px] text-zinc-650">v1.0.5-EROS</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1">
                          <span className="text-zinc-600">Provider:</span>
                          <span className="text-zinc-400 uppercase">{provider}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1">
                          <span className="text-zinc-600">Network:</span>
                          <span className={isOnline ? "text-green-500" : "text-red-500"}>{isOnline ? "Online" : "Offline"}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1 items-center">
                          <div className="flex flex-col">
                            <span className="text-zinc-600">Database:</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={dbConnected === true ? "text-green-500" : dbConnected === false ? "text-red-500" : "text-amber-500"}>
                              {dbConnected === true ? "Connected" : dbConnected === false ? "Fault" : "Checking"}
                            </span>
                            {dbConnected === false && (
                              <button 
                                onClick={async () => {
                                  setDbConnected(null);
                                  const ok = await testConnection();
                                  setDbConnected(ok);
                                }}
                                className="p-0.5 hover:text-zinc-200 text-zinc-500 transition-colors"
                                title="Retry connection"
                              >
                                <RefreshCcw className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1">
                          <span className="text-zinc-600">Sync:</span>
                          <span className={currentUser ? "text-green-500" : "text-amber-500"}>{currentUser ? "Active" : "Local"}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1">
                          <span className="text-zinc-600">Mode:</span>
                          <span className="text-zinc-400 uppercase">{gameMode}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1">
                          <span className="text-zinc-600">Heat:</span>
                          <span className="text-red-500">{lastArousalLevel}%</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900/50 pb-1">
                          <span className="text-zinc-600">PWA:</span>
                          <span className={deferredPrompt ? "text-cyan-400" : "text-zinc-600"}>{deferredPrompt ? "Ready" : "Active"}</span>
                        </div>
                      </div>

                      {deferredPrompt && (
                        <button 
                          onClick={async () => {
                            if (!deferredPrompt) return;
                            deferredPrompt.prompt();
                            const { outcome } = await deferredPrompt.userChoice;
                            console.log(`--- EROS PWA --- User choice: ${outcome}`);
                            setDeferredPrompt(null);
                          }}
                          className="w-full py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 text-[10px] font-bold uppercase tracking-wider border border-cyan-600/30 rounded-lg transition-all flex items-center justify-center gap-2 mb-2"
                        >
                          <Download className="w-3 h-3" />
                          Install Eros App
                        </button>
                      )}

                      <button 
                        onClick={() => {
                          console.log("--- EROS SYSTEM DIAGNOSTIC REPORT ---");
                          console.log("State:", { provider, gameMode, lastUsedModel, activeCharacterIds, consequences, arousalSpeed, narrativeTone });
                          console.log("User:", currentUser?.uid || "Anonymous");
                          console.log("Messages Count:", messages.length);
                          setToastNotify({ message: "Diagnostic summary captured in console logs.", isError: false });
                        }}
                        className="w-full py-1 text-[8px] font-bold uppercase tracking-tighter text-zinc-600 hover:text-zinc-400 border border-zinc-850 hover:border-zinc-700 rounded transition-all"
                      >
                        Generate Detailed Debug Console Report
                      </button>
                    </div>
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
    <div className="flex flex-col h-full safe-screen bg-[#07070a] text-zinc-100 p-2 md:p-5 gap-3 md:gap-4 overflow-hidden font-sans selection:bg-red-950 selection:text-white">
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
              onClick={handleSignIn}
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
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`p-1.5 md:px-3 md:py-1.5 border hover:border-zinc-805 rounded-lg transition-colors flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider shadow-sm ${voiceEnabled ? 'bg-red-950/20 border-red-900/50 text-red-400' : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            title="Toggle Character Voice (TTS)"
          >
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden md:inline font-mono">Voice</span>
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

          <div className="flex flex-col items-end hidden sm:flex pl-3.5 border-l border-zinc-900 animate-fade-in text-right">
            <span className="text-[7px] md:text-[8px] uppercase tracking-[0.2em] text-zinc-500 font-bold leading-none">POV MATRIX</span>
            <span className="text-[11px] md:text-xs font-semibold text-zinc-350 leading-normal mt-0.5 max-w-[120px] truncate">
              {playerCharacterId === '3rd_person' ? 'Omniscient' : availableCharacters.find(c => c.id === playerCharacterId)?.name}
            </span>
          </div>
        </div>
      </header>

      {/* Extreme Compliance Session Stats - Animated Banner */}
      <div className="flex items-center gap-2 px-2 overflow-x-auto scrollbar-none shrink-0 bg-zinc-950/40 border border-zinc-900 rounded-xl py-2">
         <div className="flex items-center gap-4 shrink-0 px-1 border-r border-zinc-900 pr-4">
            <div className="flex flex-col">
               <span className="text-[7px] font-mono font-black text-zinc-500 uppercase tracking-tighter leading-none">Stamina</span>
               <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-zinc-900 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${stamina}%` }}
                        className="h-full bg-blue-500"
                     />
                  </div>
                  <span className="text-[9px] font-mono text-zinc-400 leading-none">{stamina}</span>
               </div>
            </div>
            <div className="flex flex-col">
               <span className="text-[7px] font-mono font-black text-zinc-500 uppercase tracking-tighter leading-none">Willpower</span>
               <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-zinc-900 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${willpowerPool}%` }}
                        className="h-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.4)]"
                     />
                  </div>
                  <span className="text-[9px] font-mono text-zinc-400 leading-none">{willpowerPool}</span>
               </div>
            </div>
         </div>

         <div className="flex items-center gap-1 shrink-0 px-2">
            <span className="text-[8px] font-mono font-bold text-zinc-600 uppercase pr-1">Stance:</span>
            <button 
              onClick={() => setStance('verbal')}
              className={`px-2 py-1 rounded text-[9px] font-mono uppercase transition-all ${stance === 'verbal' ? 'bg-red-950/40 text-red-400 border border-red-900/40' : 'text-zinc-600 hover:text-zinc-400 border border-transparent'}`}
            >
              Verbal
            </button>
            <button 
              onClick={() => setStance('tactile')}
              className={`px-2 py-1 rounded text-[9px] font-mono uppercase transition-all ${stance === 'tactile' ? 'bg-red-950/40 text-red-400 border border-red-900/40' : 'text-zinc-600 hover:text-zinc-400 border border-transparent'}`}
            >
              Tactile
            </button>
         </div>
         
         <div className="flex-1" />
         
         <div className="flex items-center gap-1 shrink-0">
            <Flame className={`w-3.5 h-3.5 ${showArousalOverlay ? 'text-red-500 animate-pulse' : 'text-zinc-700'}`} />
            <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-tighter">Heat Level: {lastArousalLevel}%</span>
         </div>
      </div>

      {/* Arousal Visual Overlay */}
      <AnimatePresence>
        {showArousalOverlay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-[100] ring-[20px] md:ring-[40px] ring-inset ring-red-600/10 shadow-[inset_0_0_150px_rgba(220,38,38,0.3)] animate-pulse-slow"
          />
        )}
      </AnimatePresence>

      {/* Mobile responsive view tabs - shows on mobile and tablet only */}
      <div className="flex lg:hidden bg-zinc-950 border border-zinc-900 rounded-xl p-1 gap-1 shrink-0 safe-top">
        <button 
          type="button"
          onClick={() => setActiveMobileTab('timeline')}
          className={`tap-target flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono font-bold uppercase transition-all tracking-wider ${activeMobileTab === 'timeline' ? 'bg-red-950/40 border border-red-900/30 text-red-400 font-black' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border border-transparent'}`}
        >
          💬 Story Timeline
        </button>
        <button 
          type="button"
          onClick={() => setActiveMobileTab('dossiers')}
          className={`tap-target flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono font-bold uppercase transition-all tracking-wider ${activeMobileTab === 'dossiers' ? 'bg-red-950/40 border border-red-900/30 text-red-400 font-black' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border border-transparent'}`}
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
                  if (gameMode === 'sexting') {
                    return (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex justify-end pr-2 my-2"
                      >
                        <div className="bg-blue-600 text-white px-3.5 py-2 rounded-2xl rounded-tr-sm text-xs font-sans shadow-sm max-w-[75%] leading-relaxed">
                          {msg.content}
                        </div>
                      </motion.div>
                    );
                  }
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
                  if (gameMode === 'sexting') {
                    return (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-2 flex flex-col items-start pl-2 my-2"
                      >
                        {parsed.paragraphs.map((p, i) => (
                          <div key={i} className="bg-zinc-800 text-zinc-100 px-3.5 py-2 rounded-2xl rounded-tl-sm text-xs md:text-sm font-sans shadow-sm max-w-[85%] leading-relaxed">
                            {p}
                          </div>
                        ))}
                      </motion.div>
                    );
                  }
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-3 group"
                    >
                      {parsed.paragraphs.map((p, i) => (
                        <p key={i} className="text-zinc-250 font-sans text-xs md:text-sm leading-relaxed">
                          {p}
                        </p>
                      ))}
                      <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleRateMessage(msg.id, 1)}
                          className={`p-1 rounded bg-zinc-900/50 border border-zinc-805 hover:border-green-900/50 transition-colors ${msg.rating === 1 ? 'text-green-500 border-green-900/50' : 'text-zinc-650'}`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleRateMessage(msg.id, -1)}
                          className={`p-1 rounded bg-zinc-900/50 border border-zinc-805 hover:border-red-900/50 transition-colors ${msg.rating === -1 ? 'text-red-500 border-red-900/50' : 'text-zinc-650'}`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
              className="flex items-center gap-2 shrink-0 pr-1"
            >
              <button
                type="button"
                className="w-10 h-10 flex shrink-0 items-center justify-center bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 hover:border-zinc-800 transition-colors"
                onClick={() => setCurrentChoiceIndex((i) => (i - 1 + parsedRecent.options.length) % parsedRecent.options.length)}
              >
                ◀
              </button>

              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.button
                    key={currentChoiceIndex % parsedRecent.options.length}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => handleChoice(parsedRecent.options[currentChoiceIndex % parsedRecent.options.length].text)}
                    className="w-full bg-zinc-950 border border-zinc-900 hover:bg-zinc-900/60 hover:border-zinc-850 p-2.5 text-left transition-all duration-200 flex flex-col gap-1 active:translate-y-[1px] group min-h-[48px] justify-center rounded-lg"
                  >
                    <span className="block text-[8px] font-mono font-extrabold uppercase tracking-wider text-red-500 group-hover:text-red-400">
                      [PATH {parsedRecent.options[currentChoiceIndex % parsedRecent.options.length].num}] ({Math.abs(currentChoiceIndex % parsedRecent.options.length) + 1} OF {parsedRecent.options.length})
                    </span>
                    <p className="text-[12px] text-zinc-300 leading-snug font-sans text-wrap whitespace-normal line-clamp-4">{parsedRecent.options[currentChoiceIndex % parsedRecent.options.length].text}</p>
                  </motion.button>
                </AnimatePresence>
              </div>

              <button
                type="button"
                className="w-10 h-10 flex shrink-0 items-center justify-center bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 hover:border-zinc-800 transition-colors"
                onClick={() => setCurrentChoiceIndex((i) => (i + 1) % parsedRecent.options.length)}
              >
                ▶
              </button>

              <button
                type="button"
                className="w-10 h-10 flex shrink-0 items-center justify-center bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/10 hover:border-red-900/40 transition-colors"
                onClick={handleReroll}
                title="Reroll Narrative Outcome"
              >
                <RefreshCcw className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {(!loading && lastArousalLevel >= 100 && !climaxTriggered) && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="p-1 px-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.4)] cursor-pointer text-center animate-pulse py-2"
               onClick={() => {
                  setClimaxTriggered(true);
                  handleChoice("Surrender to the climax. Describe the intense physical release in explicit detail.");
               }}
            >
               Trigger Climax Sequence [100% HEAT]
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDossierManager(true)}
                  className="px-2 py-1 bg-red-950/30 border border-red-900/40 text-red-500 hover:text-red-400 hover:bg-red-900/20 text-[8px] rounded transition-all font-bold uppercase tracking-wider"
                >
                  Manage Cast
                </button>
                <span className="text-[9px] px-1.5 py-0.5 bg-red-950/50 border border-red-900/30 text-red-400 font-bold uppercase rounded font-mono animate-pulse">LIVE</span>
              </div>
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
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] text-zinc-500 font-mono uppercase">
                        <span>Arousal</span>
                        <span>{charState.arousal ?? 0}%</span>
                      </div>
                      <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.max(0, charState.arousal ?? 0))}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full bg-red-650 rounded-full shadow-[0_0_8px_rgba(220,38,38,0.5)]"
                        ></motion.div>
                      </div>
                    </div>

                    {(consequences || charState.trust !== undefined) && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[8px] text-zinc-500 font-mono uppercase">
                          <span>Trust</span>
                          <span>{charState.trust ?? 50}%</span>
                        </div>
                        <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, charState.trust ?? 50))}%` }}
                            transition={{ duration: 0.8 }}
                            className="h-full bg-blue-500 rounded-full"
                          ></motion.div>
                        </div>
                      </div>
                    )}

                    {(consequences || charState.affinity !== undefined) && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[8px] text-zinc-500 font-mono uppercase">
                          <span>Affinity</span>
                          <span>{charState.affinity ?? 0}%</span>
                        </div>
                        <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, charState.affinity ?? 0))}%` }}
                            transition={{ duration: 0.8 }}
                            className="h-full bg-purple-500 rounded-full"
                          ></motion.div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {charState.tags && charState.tags.map((tag, tIdx) => (
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

              {/* Pornstar Stats Ledger */}
              {gameMode === 'pornstar' && (
                <div className="mt-4 bg-zinc-900/60 border border-pink-900/30 p-3 rounded-xl space-y-3 relative overflow-hidden group">
                  {/* Subtle dynamic background glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-purple-500/5 z-0" />
                  
                  <div className="relative z-10 space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-pink-400 font-mono border-b border-pink-950 pb-1.5">
                      <span>Brand Analytics</span>
                      <span className="animate-pulse">● LIVE</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-950/80 p-2 rounded-lg border border-zinc-900">
                        <span className="block text-[8px] text-zinc-500 font-mono uppercase mb-0.5">Subscribers</span>
                        <span className="block text-sm font-display font-bold text-white tracking-widest">
                          {parsedRecent?.pornstarStats?.subscribers?.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="bg-zinc-950/80 p-2 rounded-lg border border-zinc-900">
                        <span className="block text-[8px] text-zinc-500 font-mono uppercase mb-0.5">Total Tips</span>
                        <span className="block text-sm font-display font-bold text-emerald-400 tracking-widest">
                          ${parsedRecent?.pornstarStats?.tips?.toLocaleString() ?? 0}
                        </span>
                      </div>
                    </div>

                    <div className="bg-zinc-950/80 p-2 rounded-lg border border-zinc-900 flex items-center justify-between">
                      <span className="text-[8px] text-zinc-500 font-mono uppercase">Social Feed Status</span>
                      <span className="text-[9px] font-bold text-pink-300 tracking-wide">
                        {parsedRecent?.pornstarStats?.socialMood ?? "Awaiting Data"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="flex justify-between items-center text-[10px] sm:text-xs text-zinc-600 uppercase tracking-widest font-bold shrink-0">
        <div className="flex items-center gap-4">
          <span>Engine Build: 1.0.5-EROS</span>
          {lastUsedModel && (
            <span className="text-zinc-700 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900 border-dashed animate-pulse lowercase font-mono">
              Vector: {lastUsedModel}
            </span>
          )}
        </div>
        <div className="flex gap-4 sm:gap-6">
          <span className="hidden sm:inline-block">Mode: {
            gameMode === 'free_will' ? 'Free Will' : 
            gameMode === 'pornstar' ? 'Pornstar Sim' :
            gameMode === 'sexting' ? 'Sexting Sim' :
            gameMode === 'hookup' ? 'Hookup Sim' : 'Standard'
          }</span>
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
                  onClick={handleSignIn}
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
                          <span className="lowercase">
                            {slot.gameMode === 'free_will' ? 'free will' : 
                             slot.gameMode === 'pornstar' ? 'pornstar sim' :
                             slot.gameMode === 'sexting' ? 'sexting sim' :
                             slot.gameMode === 'hookup' ? 'hookup sim' : 'standard'}
                          </span>
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

      {/* Character Dossier Manager Modal - For adding/removing characters mid-session */}
      {showDossierManager && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col gap-5 relative shadow-2xl text-left">
             <div className="flex justify-between items-center pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-red-500" />
                  <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100 font-mono">Simulated Cast Controller</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleExportDossiers}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors text-[10px] font-bold uppercase"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Export All</span>
                  </button>
                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors cursor-pointer text-[10px] font-bold uppercase">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Bulk Import</span>
                    <input type="file" accept=".json" onChange={handleBulkImportDossiers} className="hidden" />
                  </label>
                  <button onClick={() => setShowDossierManager(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors ml-4"><X className="w-5 h-5"/></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-5 pr-1 scrollbar-thin">
                <div className="bg-red-950/10 border border-red-900/30 p-3 rounded-xl flex gap-3">
                  <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-400 font-mono leading-relaxed uppercase">
                    Vectors modified here will influence the next generation cycle. Injecting new character nodes mid-simulation allows for unexpected narrative shifts.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableCharacters.map(char => {
                    const isActive = activeCharacterIds.includes(char.id);
                    return (
                      <div 
                        key={char.id} 
                        onClick={() => {
                          if (isActive && activeCharacterIds.length <= 1) {
                            setToastNotify({ message: "At least one character node must remain active.", isError: true });
                            return;
                          }
                          setActiveCharacterIds(prev => {
                            if (isActive) {
                              return prev.filter(id => id !== char.id);
                            } else {
                              // Sync starting arousal when adding via dossier manager
                              if (charStartingArousals[char.id] === undefined) {
                                setCharStartingArousals(s => ({ ...s, [char.id]: char.startingArousal ?? 20 }));
                              }
                              return [...prev, char.id];
                            }
                          });
                        }}
                        className={`p-3 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center gap-3 relative overflow-hidden group ${
                          isActive 
                            ? 'bg-zinc-900/60 border-red-900/60 shadow-[0_0_20px_rgba(153,27,27,0.15)] ring-1 ring-red-900/20' 
                            : 'bg-zinc-950/40 border-zinc-900 hover:border-zinc-700 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="relative">
                          {renderCharacterAvatarIcon(char, "w-11 h-11")}
                          {isActive && (
                            <div className="absolute -top-1 -right-1 bg-red-600 w-3 h-3 rounded-full border-2 border-zinc-950 shadow-[0_0_8px_rgba(220,38,38,0.8)] animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-bold uppercase block truncate ${isActive ? 'text-red-400' : 'text-zinc-400'}`}>
                            {char.name}
                          </span>
                          <span className="text-[8px] text-zinc-655 font-mono uppercase tracking-tighter truncate block mt-0.5">
                            {char.shortDescription}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMemoryEditingCharId(char.id);
                          }}
                          className="shrink-0 p-1.5 bg-zinc-950/50 border border-zinc-900 text-zinc-500 hover:text-red-400 rounded-lg transition-colors group-hover:border-zinc-800"
                          title="Edit Memories"
                        >
                          <Brain className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSingleDossier(char);
                          }}
                          className="shrink-0 p-1.5 bg-zinc-950/50 border border-zinc-900 text-zinc-500 hover:text-zinc-200 rounded-lg transition-colors group-hover:border-zinc-800"
                          title="Export Dossier"
                        >
                          <Save className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => setShowDossierManager(false)}
                  className="w-full bg-red-650 hover:bg-red-700 text-white font-bold p-3.5 rounded-2xl transition-all shadow-lg shadow-red-950/20 uppercase font-mono tracking-[0.2em] text-[10px] active:scale-[0.98]"
                >
                  Synchronize Cast Changes
                </button>
              </div>
          </div>
        </div>
      )}

      {/* Modal for Settings / API Core */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-5 relative shadow-2xl text-left scrollbar-thin">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-red-500" />
                <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100 font-mono">Cognitive Controller</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
            </div>

            <div className="space-y-4">
              {/* AI Gateway Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Gateway Provider</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                    <span className="text-[10px] text-zinc-500 line-clamp-1 md:line-clamp-none">Free, fast default server-side API.</span>
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
                    <span className="font-bold text-xs uppercase block">OpenRouter</span>
                    <span className="text-[10px] text-zinc-500 line-clamp-1 md:line-clamp-none">MythoMax, Llama, DeepSeek.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvider('mock')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      provider === 'mock'
                        ? 'bg-zinc-800 border-red-500 text-zinc-100'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-bold text-xs uppercase block text-orange-400">UI Test Mode</span>
                    <span className="text-[10px] text-zinc-500 line-clamp-1 md:line-clamp-none">No API key. Safe layouts & telemetry test.</span>
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
                  Uses the secure server-integrated Google **Gemini 3.5 Flash** model with optimal safety filters bypassed for explicit adult creative contexts. Under limit conditions, toggle OpenRouter.
                </div>
              )}

              {/* Advanced Model Settings (Global) */}
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 mb-1">
                  <Sliders className="w-3.5 h-3.5 text-red-500" />
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Advanced Engine Parameters</label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
                      <span>Temperature</span>
                      <span className="text-red-400 font-bold">{modelSettings.temperature.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                      value={modelSettings.temperature}
                      onChange={(e) => setModelSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    />
                    <p className="text-[8px] text-zinc-650 font-mono uppercase">Creativity / Chaos</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
                      <span>Top P</span>
                      <span className="text-red-400 font-bold">{modelSettings.topP.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                      value={modelSettings.topP}
                      onChange={(e) => setModelSettings(prev => ({ ...prev, topP: parseFloat(e.target.value) }))}
                    />
                    <p className="text-[8px] text-zinc-650 font-mono uppercase">Token Variance</p>
                  </div>
                </div>
              </div>

              {/* Auto-Save Configuration */}
              <div className="space-y-2 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 mb-1">
                  <Save className="w-3.5 h-3.5 text-red-500" />
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Persistence Protocol (Auto-Save)</label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['off', 'every-turn', 'every-5-mins'] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAutoSaveFrequency(option)}
                      className={`py-2 rounded-lg border text-[9px] font-bold uppercase tracking-tight transition-all ${
                        autoSaveFrequency === option
                          ? 'bg-red-950/20 border-red-500 text-red-100'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      {option.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>
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

      {/* Character Memory Editor Modal */}
      {memoryEditingCharId && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col gap-5 relative shadow-2xl text-left">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-900">
               <div className="flex items-center gap-2">
                 <Brain className="w-5 h-5 text-red-500" />
                 <h3 className="font-bold uppercase tracking-wider text-sm text-zinc-100 font-mono text-ellipsis overflow-hidden">
                   Memory Drive: {availableCharacters.find(c => c.id === memoryEditingCharId)?.name}
                 </h3>
               </div>
               <button onClick={() => setMemoryEditingCharId(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-5 h-5"/></button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Active Impressions</label>
                  <span className="text-[9px] font-mono text-zinc-650">{(charMemories[memoryEditingCharId] || []).length} / 10 Nodes</span>
                </div>
                
                <div className="space-y-2">
                  {(charMemories[memoryEditingCharId] || []).map((mem, idx) => (
                    <div key={idx} className="group relative">
                      <textarea
                        className="w-full bg-zinc-905 border border-zinc-805 p-2 text-zinc-300 text-xs rounded-lg min-h-[70px] outline-none focus:border-red-900/50 transition-all font-sans leading-relaxed shadow-inner"
                        value={mem}
                        onChange={(e) => handleUpdateMemory(memoryEditingCharId, e.target.value, idx)}
                      />
                      <button 
                        onClick={() => handleUpdateMemory(memoryEditingCharId, '', idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  
                  {(!charMemories[memoryEditingCharId] || charMemories[memoryEditingCharId].length < 10) && (
                    <button
                      onClick={() => handleUpdateMemory(memoryEditingCharId, "New character memory...")}
                      className="w-full py-2 bg-zinc-900/30 border border-zinc-850 border-dashed hover:border-zinc-700 hover:bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add memory record
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-red-950/10 border border-red-900/30 p-3 rounded-xl flex gap-3">
                <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">
                  These records define the character's internal model of the user and local world state. Modifying these mid-simulation will rewrite their personality context for future turns.
                </p>
              </div>
            </div>

            <button
               onClick={() => setMemoryEditingCharId(null)}
               className="w-full bg-zinc-800 hover:bg-zinc-750 text-zinc-100 font-bold p-3.5 rounded-2xl transition-all uppercase font-mono tracking-[0.2em] text-[10px] shadow-lg active:scale-95"
            >
              Seal Memory Drive
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

