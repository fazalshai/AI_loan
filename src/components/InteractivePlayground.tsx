import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  Volume2, 
  Mic, 
  MicOff, 
  Sparkles, 
  Database,
  Loader2,
  Languages,
  ArrowRightLeft,
  XCircle,
  PhoneCall,
  PhoneOff,
  UserCheck,
  Key,
  CheckCircle,
  Smartphone
} from 'lucide-react';

interface ChatMessage {
  sender: 'user' | 'agent';
  text: string;
  time: string;
  detectedLang?: 'en' | 'ar';
  translation?: {
    user_translated?: string;
    ai_translated?: string;
  };
  data?: any;
}

export const InteractivePlayground: React.FC = () => {
  const [agent, setAgent] = useState<'real_estate' | 'loan'>('real_estate');
  const [languageMode, setLanguageMode] = useState<'auto' | 'en' | 'ar'>('auto');
  const [activeLanguage, setActiveLanguage] = useState<'en' | 'ar'>('en');
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Tabs on the right side
  const [activeRightTab, setActiveRightTab] = useState<'translation' | 'database' | 'analysis'>('translation');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);

  // Audio / TTS States
  const [synthType] = useState<'elevenlabs'>('elevenlabs'); // Default to ElevenLabs
  const [xiApiKey, setXiApiKey] = useState(() => localStorage.getItem('elevenlabs_api_key') || '');
  const [selectedVoice] = useState('wJ5MX7uuKXZwFqGdWM4N'); // Default to custom voice
  const [ttsError, setTtsError] = useState<string | null>(null);
  
  // Flask Backend API URL for production split hosting
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('backend_api_url') || '');
  const cleanBackendUrl = backendUrl.trim().replace(/\/+$/, '');
  
  // Microphone & Speech Loops
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isMuted, setIsMuted] = useState(false); 

  // Call simulation states: 'idle' | 'incoming' | 'connected' | 'ended'
  const [callState, setCallState] = useState<'idle' | 'incoming' | 'connected' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState(0);

  // Raw Database values (pre-loaded from Excel)
  const [defaultData, setDefaultData] = useState<any[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  // Filtered search results
  const [explorerData, setExplorerData] = useState<any[]>([]);
  const [loanCalculation, setLoanCalculation] = useState<any | null>(null);

  // Scroll Container Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const bargeInAllowedRef = useRef(true);
  // Tracks whether agent is currently speaking (for echo detection)
  const isSpeakingRef = useRef(false);
  // Stores the exact text the agent is saying RIGHT NOW — used for echo fingerprinting
  const currentAgentSpeechRef = useRef<string>("");
  // Hard suppression window at start of agent speech (ms) — mic is fully off
  const echoSuppressUntilRef = useRef<number>(0);
  
  const callStateRef = useRef(callState);
  const isPlayingAudioRef = useRef(isPlayingAudio);
  const isMutedRef = useRef(isMuted);
  const isTypingRef = useRef(isTyping);

  // Web Audio Ringtone oscillators
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<any>(null);

  // Sync refs to access inside async events
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    isPlayingAudioRef.current = isPlayingAudio;
  }, [isPlayingAudio]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  // Adjust scrolls locally
  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    const translationContainer = translationContainerRef.current;
    if (translationContainer) {
      translationContainer.scrollTop = translationContainer.scrollHeight;
    }
  }, [messages]);

  // Keep elevenlabs key in LocalStorage, cleaning up if it was set to the compromised key
  useEffect(() => {
    const cachedKey = localStorage.getItem('elevenlabs_api_key');
    if (cachedKey === 'sk_bf6f6fffe8b010b342c2b0cc9fee10e8d85e30f0725f40e1') {
      localStorage.removeItem('elevenlabs_api_key');
      setXiApiKey('');
    } else {
      localStorage.setItem('elevenlabs_api_key', xiApiKey);
    }
  }, [xiApiKey]);

  // Keep backend url in LocalStorage
  useEffect(() => {
    if (backendUrl) {
      localStorage.setItem('backend_api_url', backendUrl);
    } else {
      localStorage.removeItem('backend_api_url');
    }
  }, [backendUrl]);



  // Call Duration Timer
  useEffect(() => {
    let interval: any;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  // Pre-load Excel dataset
  useEffect(() => {
    loadSpreadsheetRows();
    resetChat();
  }, [agent]);

  const loadSpreadsheetRows = async () => {
    setIsLoadingDb(true);
    try {
      const response = await fetch(`${cleanBackendUrl}/api/data?agent=${agent}`);
      const result = await response.json();
      if (result.data) {
        setDefaultData(result.data);
      }
    } catch (e) {
      console.error("Failed to load spreadsheet rows:", e);
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Web Audio simulated Telephone Ringtone
  const playRingtone = () => {
    try {
      if (audioContextRef.current) return;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;

      const ringBeep = () => {
        if (ctx.state === 'closed') return;
        
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440;
        osc2.frequency.value = 480;

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + 1.2);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.3);

        osc1.start();
        osc2.start();

        setTimeout(() => {
          try {
            osc1.stop();
            osc2.stop();
          } catch(e){}
        }, 1500);
      };

      ringBeep();
      ringtoneIntervalRef.current = setInterval(ringBeep, 4000);
    } catch(e) {
      console.warn("AudioContext failed to start:", e);
    }
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Initialize Speech Recognition with Auto-Restart for Continuous Call conversation
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = activeLanguage === 'en' ? 'en-US' : 'ar-AE';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const normalize = (t: string) =>
          t.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();

        const combinedText = normalize(interimTranscript.trim() || finalTranscript.trim());
        const cleanFinal = normalize(finalTranscript.trim());

        // ── ECHO FINGERPRINT CHECK ──────────────────────────────────────────
        // During agent speech: check if what the mic hears is the agent's own
        // voice echoing back. Compute word-overlap between mic text and agent text.
        // High overlap = echo → discard. Low overlap = real human → barge-in.
        if (isSpeakingRef.current && combinedText.length >= 3) {
          // Hard suppression window at start of speech (first 800ms) — echo is
          // strongest then, ignore everything to be safe.
          if (Date.now() < echoSuppressUntilRef.current) {
            console.log("[Echo suppressor] Hard window active, discarding:", combinedText);
            return;
          }

          // Word-overlap similarity between mic input and agent speech
          const agentWords = new Set(normalize(currentAgentSpeechRef.current).split(/\s+/).filter(w => w.length > 2));
          const micWords = combinedText.split(/\s+/).filter((w: string) => w.length > 2);
          const matchCount = micWords.filter((w: string) => agentWords.has(w)).length;
          const similarity = micWords.length > 0 ? matchCount / micWords.length : 0;

          if (similarity >= 0.45) {
            // ≥45% word overlap → very likely echo of agent's own voice, discard
            console.log(`[Echo suppressor] Echo detected (similarity=${(similarity*100).toFixed(0)}%), discarding:`, combinedText);
            return;
          }
          // Low similarity → genuine human interruption → barge-in immediately
          console.log(`[Barge-in] REAL human interruption detected (similarity=${(similarity*100).toFixed(0)}%):`, combinedText);
        }
        // ────────────────────────────────────────────────────────────────────

        // Barge-in: stop agent and cancel pending API call immediately
        if (combinedText.length >= 4 && (isPlayingAudioRef.current || isTypingRef.current) && bargeInAllowedRef.current) {
          const IGNORE_BARGE_IN = new Set(["hi", "hello", "hmm", "uh", "this", "this is", "مرحبا", "أهلاً"]);
          if (!IGNORE_BARGE_IN.has(combinedText)) {
            console.log("[Barge-in] Interrupting agent. Text:", combinedText);
            stopAudio();
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
            setIsTyping(false);
          }
        }

        // Only process final clean transcripts as actual messages
        if (cleanFinal.length >= 3 && !isSpeakingRef.current) {
          const IGNORE_FILLERS = new Set(["hi", "hello", "hmm", "uh", "this", "this is", "مرحبا", "أهلاً", "نعم", "yes", "no", "لا"]);
          if (!IGNORE_FILLERS.has(cleanFinal)) {
            submitMessage(finalTranscript);
          } else {
            console.log("[STT] Ignored filler:", finalTranscript);
          }
        } else if (cleanFinal.length >= 3 && !isSpeakingRef.current) {
          submitMessage(finalTranscript);
        }
      };

      rec.onerror = (e: any) => {
        console.error('STT Error:', e);
        setIsListening(false);
      };

      // Auto-restart loop — keep mic alive at all times (even during agent speech)
      // so the user can interrupt naturally. Echo filtering happens in onresult.
      rec.onend = () => {
        setIsListening(false);
        setTimeout(() => {
          if (
            callStateRef.current === 'connected' && 
            !isMutedRef.current
          ) {
            try {
              rec.start();
            } catch (e) {}
          }
        }, 300);
      };

      recognitionRef.current = rec;
    }
  }, [activeLanguage]);

  const resetChat = () => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages([
      {
        sender: 'agent',
        text: getWelcomeMessage(activeLanguage),
        time: timeStr,
        detectedLang: activeLanguage,
        translation: {
          ai_translated: getWelcomeMessage(activeLanguage === 'en' ? 'ar' : 'en')
        }
      }
    ]);
    setExplorerData([]);
    setLoanCalculation(null);
  };

  const getWelcomeMessage = (lang: 'en' | 'ar') => {
    if (agent === 'real_estate') {
      return lang === 'en'
        ? "Hello! I am Raj, your Dubai real estate assistant. I can search properties live from our Dubai listings database. Ask me about properties in JLT, Downtown Dubai, or Dubai Hills Estate."
        : "مرحباً بك! أنا راج، مستشارك العقاري في دبي. يمكنني البحث عن العقارات مباشرة من قاعدة بياناتنا. استفسر عن شقق في أبراج بحيرات جميرا، أو بنتهاوس في داون تاون دبي.";
    } else {
      return lang === 'en'
        ? "Hello! I am Faris, your Dubai mortgage loan agent. Provide your salary, credit score, liabilities, and age, and I will assess your loan eligibility and compute EMI."
        : "أهلاً بك! أنا فارس، مستشار التمويل العقاري في دبي. يرجى تزويدي بالراتب، درجة الائتمان، الالتزامات الشهرية، والعمر، وسأقوم باحتساب أقصى مبلغ قرض مؤهل لك.";
    }
  };

  // Browser Speak Synthesis
  const speakBrowser = (text: string, speakLang: 'en' | 'ar') => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speakLang === 'en' ? 'en-GB' : 'ar-AE';

    const voices = window.speechSynthesis.getVoices();
    let targetVoice = null;
    if (speakLang === 'en') {
      targetVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes("Siri"))
        || voices.find(v => v.lang.startsWith('en') && v.name.includes("Samantha"))
        || voices.find(v => v.lang.startsWith('en') && v.name.includes("Google"))
        || voices.find(v => v.lang.startsWith('en') && v.name.includes("Daniel"))
        || voices.find(v => v.lang.startsWith('en') && (v.name.includes("Premium") || v.name.includes("Natural")))
        || voices.find(v => v.lang.startsWith('en'));
    } else {
      targetVoice = voices.find(v => v.lang.startsWith('ar') && v.name.includes("Siri"))
        || voices.find(v => v.lang.startsWith('ar') && v.name.includes("Maged"))
        || voices.find(v => v.lang.startsWith('ar') && v.name.includes("Laila"))
        || voices.find(v => v.lang.startsWith('ar') && v.name.includes("Google"))
        || voices.find(v => v.lang.startsWith('ar'));
    }

    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    utterance.onstart = () => {
      setIsPlayingAudio(true);
      bargeInAllowedRef.current = false;
      setTimeout(() => {
        bargeInAllowedRef.current = true;
      }, 1200);
    };
    
    utterance.onstart = () => {
      isSpeakingRef.current = true;
      // Hard suppress echo for first 800ms of browser TTS too
      echoSuppressUntilRef.current = Date.now() + 800;
      bargeInAllowedRef.current = false;
      setTimeout(() => { bargeInAllowedRef.current = true; }, 900);
      // Keep mic alive so user can interrupt — echo fingerprinting handles filtering
      try { recognitionRef.current?.start(); } catch(e) {}
    };

    utterance.onend = () => {
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
      currentAgentSpeechRef.current = "";
      // Mic reset after agent finishes
      setTimeout(() => {
        if (callStateRef.current === 'connected' && !isMutedRef.current) {
          try { recognitionRef.current?.stop(); } catch(e) {}
          setTimeout(() => { try { recognitionRef.current?.start(); } catch(e) {} }, 200);
        }
      }, 100);
    };
    
    utterance.onerror = () => {
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
      currentAgentSpeechRef.current = "";
    };

    window.speechSynthesis.speak(utterance);
  };

  // Safe Blob-based Audio Playback to prevent browser decode errors
  const speakElevenLabs = async (text: string, speakLang: 'en' | 'ar') => {
    try {
      setIsPlayingAudio(true);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      // Stream directly from backend via GET to bypass CORS preflight and AdBlockers
      const encodedText = encodeURIComponent(text);
      const audioUrl = `${cleanBackendUrl}/api/tts?text=${encodedText}&voice_id=${selectedVoice}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlayingAudio(true);
        isSpeakingRef.current = true;
        setTtsError(null);
        // Hard suppression: first 800ms after audio starts, fully block mic input
        // (echo is strongest at audio onset). After that, echo fingerprinting takes over.
        echoSuppressUntilRef.current = Date.now() + 800;
        bargeInAllowedRef.current = false;
        setTimeout(() => {
          bargeInAllowedRef.current = true;
        }, 900);
        // Keep mic running — don't stop it — user must be able to interrupt at any time
        // (echo filtering in onresult handles distinguishing user vs echo)
        if (!recognitionRef.current) return;
        try { recognitionRef.current.start(); } catch(e) {}
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
        isSpeakingRef.current = false;
        currentAgentSpeechRef.current = "";  // Clear echo fingerprint
        // Give mic a brief reset after agent finishes — cleanly capture user's next turn
        setTimeout(() => {
          if (callStateRef.current === 'connected' && !isMutedRef.current) {
            try { recognitionRef.current?.stop(); } catch(e) {}
            setTimeout(() => {
              try { recognitionRef.current?.start(); } catch(e) {}
            }, 200);
          }
        }, 100);
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        setTtsError("Failed to decode audio stream.");
        speakBrowser(text, speakLang);
      };

      try {
        await audio.play();
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('interrupted') || err.message?.includes('pause')) {
          console.log("Audio play was interrupted intentionally by a call to pause().");
          return;
        }
        throw err;
      }

    } catch (e: any) {
      console.warn("ElevenLabs failed, falling back to browser voice:", e);
      setTtsError(e.message || "ElevenLabs failed. Falling back.");
      speakBrowser(text, speakLang);
    }
  };

  const triggerTTS = (text: string, speakLang: 'en' | 'ar') => {
    if (!text || !text.trim()) {
      setIsPlayingAudio(false);
      return;
    }
    // Store what the agent is about to say — used by echo fingerprinting in onresult
    // so the mic can stay open but still distinguish echo from real user speech
    currentAgentSpeechRef.current = text;
    if (synthType === 'elevenlabs') {
      speakElevenLabs(text, speakLang);
    } else {
      speakBrowser(text, speakLang);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
  };

  // Submit message
  const submitMessage = async (msgText: string) => {
    if (!msgText.trim()) return;

    // Filter out short filler noise from being submitted to state/server
    const cleanText = msgText.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").trim();
    if (cleanText.length < 3) {
      console.log("Ignored submission of too short transcript:", msgText);
      return;
    }
    const IGNORE_FILLERS = new Set(["hi", "hello", "hmm", "uh", "this", "this is", "مرحبا", "أهلاً", "نعم", "yes", "no", "لا"]);
    if (IGNORE_FILLERS.has(cleanText)) {
      console.log("Ignored submission of standalone filler noise:", msgText);
      return;
    }

    stopAudio();
    
    // Abort any existing pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      sender: 'user',
      text: msgText,
      time: timeStr
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const historyContext = messages.map(m => ({ sender: m.sender, text: m.text }));
      const payload: any = {
        message: msgText,
        agent,
        history: historyContext
      };
      
      if (languageMode !== 'auto') {
        payload.language = languageMode;
      }

      const response = await fetch(`${cleanBackendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });

      const resData = await response.json();

      if (languageMode === 'auto' && resData.active_language) {
        setActiveLanguage(resData.active_language);
      }

      const agentMsg: ChatMessage = {
        sender: 'agent',
        text: resData.text || 'Error parsing response.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detectedLang: resData.active_language || activeLanguage,
        translation: {
          user_translated: resData.translation?.user_translated,
          ai_translated: resData.translation?.ai_translated
        },
        data: resData.data
      };

      setMessages(prev => {
        const next = [...prev];
        const lastUser = next[next.length - 1];
        if (lastUser && lastUser.sender === 'user') {
          lastUser.translation = {
            user_translated: resData.translation?.user_translated
          };
          lastUser.detectedLang = resData.detected_language;
        }
        next.push(agentMsg);
        return next;
      });

      if (agent === 'real_estate' && Array.isArray(resData.data)) {
        setExplorerData(resData.data);
      } else if (agent === 'loan' && resData.data) {
        if (resData.data.calculation) {
          setLoanCalculation(resData.data.calculation);
        }
        if (Array.isArray(resData.data.references)) {
          setExplorerData(resData.data.references);
        }
      }

      triggerTTS(agentMsg.text, agentMsg.detectedLang || activeLanguage);

    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log("Gemini request was aborted successfully due to user interruption.");
        return;
      }
      console.error(e);
      setMessages(prev => [...prev, {
        sender: 'agent',
        text: activeLanguage === 'en' ? 'Connection lost to server.' : 'خطأ في الاتصال بالخادم.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setIsMuted(!isMuted);
  };

  const handleMicClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isPlayingAudio) {
      stopAudio();
    }
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsMuted(false);
      try {
        recognitionRef.current?.start();
      } catch(e){}
    }
  };

  const clearFilters = (e: React.MouseEvent) => {
    e.preventDefault();
    setExplorerData([]);
    setLoanCalculation(null);
  };

  // Ringing Call Flow
  const initiateCall = (e: React.MouseEvent) => {
    e.preventDefault();
    resetChat(); // Reset conversation to start fresh
    setCallState('incoming');
    playRingtone();
  };

  const answerCall = async (e: React.MouseEvent) => {
    e.preventDefault();
    stopRingtone();
    setCallState('connected');
    setIsMuted(false);
    
    // Request microphone access during this user gesture to authorize the browser
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      // Start the continuous SpeechRecognition engine immediately!
      try {
        recognitionRef.current?.start();
      } catch (e) {}
      bargeInAllowedRef.current = false;
      setTimeout(() => {
        bargeInAllowedRef.current = true;
      }, 1500); // 1.5s guard window for pickup click
    } catch (err) {
      console.warn("Microphone access denied or blocked:", err);
    }
    
    // Start greeting immediately (plays streaming audio)
    const welcomeText = getWelcomeMessage(activeLanguage);
    const welcomeMsg: ChatMessage = {
      sender: 'agent',
      text: welcomeText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([welcomeMsg]);
    triggerTTS(welcomeText, activeLanguage);
  };

  const declineCall = (e: React.MouseEvent) => {
    e.preventDefault();
    stopRingtone();
    setCallState('idle');
  };

  const endCall = async (e: React.MouseEvent) => {
    e.preventDefault();
    setCallState('ended');
    stopAudio();

    const callHistory = [...messages];
    const duration = callDuration;

    // Immediately trigger backend call analysis
    if (callHistory.length > 1) {
      setActiveRightTab('analysis');
      setIsAnalyzing(true);
      setAnalysisResult(null);
      try {
        const response = await fetch(`${cleanBackendUrl}/api/analyze-call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            agent,
            duration,
            history: callHistory
          })
        });
        if (response.ok) {
          const resData = await response.json();
          if (resData.analysis) {
            setAnalysisResult(resData.analysis);
          }
        }
      } catch (err) {
        console.error("Error analyzing call:", err);
      } finally {
        setIsAnalyzing(false);
      }
    }

    setTimeout(() => {
      setCallState('idle');
    }, 1200);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <section id="playground" className="playground-section" style={{ padding: '6rem 0', position: 'relative' }}>
      <div className="container">
        
        {/* Section Title */}
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <span className="badge">
            <Sparkles size={12} style={{ color: 'var(--secondary)' }} /> Voice & Dialect Translation Sandbox
          </span>
          <h2 style={{ fontSize: '2.5rem', marginTop: '1rem', marginBottom: '1.2rem' }}>
            Dual-Agent <span className="gradient-accent">Live Voice Sandbox</span>
          </h2>
          <p style={{ maxWidth: '650px', margin: '0 auto', fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
            Experience our intelligent dialect recognition engine. Turn on the mic and speak in English or Arabic; the system auto-tunes language mode and generates real-time side translation!
          </p>
        </div>

        {/* Global Connection Settings Block */}
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2.5rem', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1.5rem'
          }}>
            
            {/* API Status Checkers */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={12} style={{ color: 'var(--secondary)' }} /> Gemini 2.5 Flash
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Connected & Active (.env API Key)</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ACTIVE AGENT</span>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-glass)' }}>
                  <button 
                    className={`btn-sub-toggle ${agent === 'real_estate' ? 'active' : ''}`}
                    onClick={() => { setAgent('real_estate'); stopAudio(); }}
                  >
                    🏡 Raj (Real Estate)
                  </button>
                  <button 
                    className={`btn-sub-toggle ${agent === 'loan' ? 'active' : ''}`}
                    onClick={() => { setAgent('loan'); stopAudio(); }}
                  >
                    🏦 Faris (Mortgage Loan)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TUNING DIALECT MODE</span>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-glass)' }}>
                  <button 
                    className={`btn-sub-toggle ${languageMode === 'auto' ? 'active' : ''}`}
                    onClick={() => { setLanguageMode('auto'); stopAudio(); }}
                  >
                    ✨ Auto-Detect (Eng/Ar)
                  </button>
                  <button 
                    className={`btn-sub-toggle ${languageMode === 'en' ? 'active' : ''}`}
                    onClick={() => { setLanguageMode('en'); setActiveLanguage('en'); stopAudio(); }}
                  >
                    🇺🇸 English Only
                  </button>
                  <button 
                    className={`btn-sub-toggle ${languageMode === 'ar' ? 'active' : ''}`}
                    onClick={() => { setLanguageMode('ar'); setActiveLanguage('ar'); stopAudio(); }}
                  >
                    🇦🇪 Arabic Only
                  </button>
                </div>
              </div>
            </div>

            {/* ElevenLabs API Key Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1, maxWidth: '420px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Key size={12} style={{ color: 'var(--primary)' }} /> ELEVENLABS SYNTHESIZER (STREAMING)
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: synthType === 'elevenlabs' ? 'var(--primary)' : 'var(--text-secondary)' }}>
                    <input type="radio" name="synth" checked={synthType === 'elevenlabs'} readOnly /> ElevenLabs (Human Stream)
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '5px', alignItems: 'center' }}>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#34d399',
                  fontSize: '0.8rem',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.05)'
                }}>
                  <CheckCircle size={14} />
                  <span>Secure Server Key (.env Active)</span>
                </div>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#a78bfa',
                  fontSize: '0.8rem',
                  boxShadow: '0 0 10px rgba(139, 92, 246, 0.05)'
                }}>
                  <Volume2 size={14} />
                  <span>Raj Multilingual Active</span>
                </div>
              </div>
            </div>

            {/* Flask Backend API URL Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1, maxWidth: '420px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🌐 PRODUCTION BACKEND API URL
              </span>
              <input 
                type="text" 
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g. https://dubai-advisor.onrender.com (empty for local)"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  outline: 'none',
                  transition: 'var(--transition-smooth)'
                }}
              />
            </div>

          </div>
        </div>

        {/* Sandbox Split Panels */}
        <div className="grid-2" style={{ alignItems: 'stretch' }}>
          
          {/* LEFT COLUMN: Smartphone Mockup Call Dashboard */}
          <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '620px', position: 'relative', overflow: 'hidden' }}>
            
            {/* Phone Notch & Styling details */}
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-glass)',
              paddingBottom: '0.8rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={16} style={{ color: 'var(--secondary)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  AGENT TELEPHONY TERMINAL
                </span>
              </div>
              <div>
                <span className="pulse-indicator" />
                <span style={{ fontSize: '0.7rem', color: '#10b981', marginLeft: '5px', fontWeight: 'bold' }}>STREAMING LIVE</span>
              </div>
            </div>

            {/* SMARTPHONE DEVICE SCREEN MOCKUP */}
            <div className="phone-device-frame" style={{
              width: '320px',
              height: '480px',
              borderRadius: '24px',
              background: '#090d16',
              border: '6px solid #1e293b',
              boxShadow: '0 15px 35px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}>
              
              {/* Speaker notch */}
              <div style={{ height: '18px', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: '60px', height: '4px', background: '#334155', borderRadius: '2px' }} />
              </div>

              {/* IDLE SCREEN (Dialer style layout) */}
              {callState === 'idle' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.5rem', color: '#fff' }}>
                  <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    <div style={{
                      width: '76px',
                      height: '76px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-glass)',
                      margin: '0 auto 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2rem',
                      color: 'var(--secondary)'
                    }}>
                      {agent === 'real_estate' ? '🏡' : '🏦'}
                    </div>
                    <h3 style={{ fontSize: '1.25rem', margin: 0 }}>
                      {agent === 'real_estate' ? 'Raj (العقارات)' : 'Faris (القروض)'}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {agent === 'real_estate' ? 'Dubai Property Advisor' : 'Dubai Mortgage Specialist'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginBottom: '1rem' }}>
                    <button onClick={initiateCall} className="dial-call-btn">
                      <Phone size={18} /> Call Agent (اتصال)
                    </button>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      Ready to establish real-time phone connection
                    </span>
                  </div>
                </div>
              )}

              {/* INCOMING CALL SCREEN */}
              {callState === 'incoming' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2rem 1.5rem', color: '#fff', background: '#0b132b' }}>
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div className="ringing-animation" style={{
                      width: '76px',
                      height: '76px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)',
                      margin: '0 auto 1.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 25px var(--secondary-glow)'
                    }}>
                      <PhoneCall size={32} />
                    </div>
                    <h3 style={{ fontSize: '1.3rem', margin: 0 }}>
                      {agent === 'real_estate' ? 'Raj Calling...' : 'Faris Calling...'}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                      INCOMING CALL (مكالمة واردة)
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', marginBottom: '1.5rem' }}>
                    <button onClick={answerCall} className="phone-action-btn accept" title="Answer call">
                      <Phone size={20} />
                    </button>
                    <button onClick={declineCall} className="phone-action-btn decline" title="Decline call">
                      <PhoneOff size={20} />
                    </button>
                  </div>
                </div>
              )}

              {/* CONNECTED STATE (Active Call Layout) */}
              {callState === 'connected' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.5rem', color: '#fff' }}>
                  
                  {/* Top Call Info */}
                  <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <h4 style={{ fontSize: '1.2rem', margin: 0 }}>
                      {agent === 'real_estate' ? 'Raj (العقارات)' : 'Faris (القروض)'}
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', display: 'block', marginTop: '3px' }}>
                      CONNECTED ({Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')})
                    </span>
                  </div>

                  {/* ElevenLabs API failure error notice */}
                  {ttsError && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '0.7rem',
                      color: '#f87171',
                      textAlign: 'center',
                      margin: '10px 0'
                    }}>
                      ⚠️ {ttsError}. (Using browser voice fallback)
                    </div>
                  )}

                  {/* Dynamic audio waves */}
                  <div style={{ display: 'flex', gap: '4px', height: '40px', alignItems: 'center', justifyContent: 'center' }}>
                    {Array.from({ length: 14 }).map((_, idx) => {
                      const isActive = isPlayingAudio || isListening;
                      return (
                        <div 
                          key={idx}
                          style={{
                            width: '4px',
                            height: '100%',
                            background: isPlayingAudio ? 'var(--primary)' : (isListening ? 'var(--secondary)' : 'rgba(255,255,255,0.2)'),
                            borderRadius: '2px',
                            transform: 'scaleY(0.15)',
                            transformOrigin: 'center',
                            animationName: isActive ? 'wavePulse' : 'none',
                            animationDuration: '1s',
                            animationTimingFunction: 'ease-in-out',
                            animationIterationCount: 'infinite',
                            animationDelay: isActive ? `${idx * 0.07}s` : '0s',
                            transition: 'background 0.3s ease'
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Active Call Controls */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                    
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {isPlayingAudio ? "🔊 Agent Speaking (Interrupt anytime by speaking)" : (isListening ? "🎙 Listening... Speak naturally!" : "Muted")}
                    </span>

                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '1.8rem', width: '100%', marginBottom: '0.5rem' }}>
                      
                      {/* Mute button container */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                        <button 
                          onClick={toggleMute}
                          className={`circle-control-btn ${isMuted ? 'muted' : ''}`}
                          title={isMuted ? "Unmute Mic" : "Mute Mic"}
                        >
                          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Mute</span>
                      </div>

                      {/* Hang up call button container */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                        <button onClick={endCall} className="circle-control-btn hangup" title="End Call">
                          <PhoneOff size={20} />
                        </button>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>End Call</span>
                      </div>

                      {/* Explicit speak barge in action container */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                        <button 
                          onClick={handleMicClick}
                          className={`circle-control-btn ${isListening && !isMuted ? 'listening' : ''}`}
                          title="Talk / Listen"
                        >
                          <Mic size={18} />
                        </button>
                        <span style={{ fontSize: '0.65rem', color: isListening ? 'var(--secondary)' : 'var(--text-muted)' }}>
                          {isListening ? 'Listening' : 'Talk Now'}
                        </span>
                      </div>

                    </div>

                  </div>

                </div>
              )}

              {/* CALL ENDED SCREEN */}
              {callState === 'ended' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', background: '#070a0e' }}>
                  <PhoneOff size={36} style={{ color: '#ef4444', marginBottom: '10px' }} />
                  <h4 style={{ margin: 0 }}>Call Disconnected</h4>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Saving conversation log...</span>
                </div>
              )}

            </div>

            {/* Active chat transcript inside Phone panel for context */}
            <div style={{ width: '100%', borderTop: '1px solid var(--border-glass)', marginTop: '1.5rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '5px' }}>
                LIVE TRANSCRIPT FEED
              </span>
              <div 
                ref={chatContainerRef}
                className="custom-scrollbar"
                style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.75rem' }}
              >
                {messages.map((m, i) => (
                  <div key={i} style={{ color: m.sender === 'user' ? '#94a3b8' : '#38bdf8' }}>
                    <strong>{m.sender === 'user' ? 'You: ' : 'Agent: '}</strong>
                    {m.text}
                  </div>
                ))}
                {isTyping && <div style={{ color: 'var(--text-muted)' }}>Generating response...</div>}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Translation Desk & Database List */}
          <div className="glass-panel" style={{ padding: '2rem', height: '620px', display: 'flex', flexDirection: 'column' }}>
            
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '1.5rem', paddingBottom: '3px' }}>
              <button 
                className={`tab-btn ${activeRightTab === 'translation' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('translation')}
              >
                <Languages size={14} /> Dialect Translation Desk
              </button>
              
              <button 
                className={`tab-btn ${activeRightTab === 'database' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('database')}
              >
                <Database size={14} /> Database Explorer
              </button>

              <button 
                className={`tab-btn ${activeRightTab === 'analysis' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('analysis')}
              >
                <Sparkles size={14} /> Lead Analyzer
              </button>
            </div>

            {/* TAB CONTENT: TRANSLATION DESK */}
            {activeRightTab === 'translation' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Dual-Language Realtime Translation Log
                  </span>
                  <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                    <ArrowRightLeft size={10} /> English ↔ Arabic
                  </span>
                </div>

                <div 
                  ref={translationContainerRef}
                  className="custom-scrollbar" 
                  style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}
                >
                  {messages.length <= 1 && (
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      padding: '2rem',
                      height: '100%'
                    }}>
                      <Languages size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                      <p style={{ fontSize: '0.8rem' }}>Translations will print side-by-side as soon as dialog starts.</p>
                    </div>
                  )}

                  {messages.map((m, idx) => {
                    const isArabic = m.detectedLang === 'ar';
                    const translationText = isArabic 
                      ? (m.translation?.user_translated || m.translation?.ai_translated || '')
                      : (m.translation?.user_translated || m.translation?.ai_translated || '');

                    if (idx === 0 && m.sender === 'agent' && !m.translation?.ai_translated) {
                      return null;
                    }

                    return (
                      <div key={idx} style={{
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: m.sender === 'user' ? 'var(--primary)' : 'var(--secondary)' }}>
                            {m.sender === 'user' ? 'USER DIALOGUE' : 'AGENT DIALOGUE'}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            Origin: {isArabic ? 'Arabic (🇦🇪)' : 'English (🇺🇸)'}
                          </span>
                        </div>

                        {/* Side by side display */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          
                          {/* Original */}
                          <div style={{ borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '10px' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '3px' }}>ORIGINAL</div>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', whiteSpace: 'pre-line' }}>{m.text}</div>
                          </div>

                          {/* Translated */}
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--secondary)', marginBottom: '3px' }}>TRANSLATED</div>
                            <div style={{ fontSize: '0.8rem', color: '#fff', fontStyle: 'italic', whiteSpace: 'pre-line' }}>
                              {translationText || 'Translating...'}
                            </div>
                            {translationText && (
                              <button 
                                type="button"
                                onClick={() => triggerTTS(translationText, isArabic ? 'en' : 'ar')}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  fontSize: '0.65rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  marginTop: '5px'
                                }}
                              >
                                <Volume2 size={10} /> Speak
                              </button>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB CONTENT: DATABASE EXPLORER */}
            {activeRightTab === 'database' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                
                {agent === 'loan' && loanCalculation && (
                  <div style={{
                    background: 'rgba(139, 92, 246, 0.08)',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    borderRadius: '10px',
                    padding: '1rem',
                    marginBottom: '1rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MAX ELIGIBLE LOAN</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-display)' }}>
                        {formatCurrency(loanCalculation.max_eligible_loan)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MONTHLY EMI</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>
                        {formatCurrency(loanCalculation.monthly_emi)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>DEBT-TO-INCOME (DTI)</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: loanCalculation.dti_ratio > 50 ? '#ef4444' : '#10b981' }}>
                        {loanCalculation.dti_ratio}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>STATUS</div>
                      <span style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        width: 'fit-content',
                        background: loanCalculation.status === 'Approved' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                        color: loanCalculation.status === 'Approved' ? '#10b981' : '#ef4444'
                      }}>
                        {loanCalculation.status}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {explorerData.length > 0
                      ? `Filtered Matches (${explorerData.length})`
                      : `Dubai Database Browser (${defaultData.length} records loaded)`
                    }
                  </span>
                  
                  {explorerData.length > 0 && (
                    <button 
                      onClick={clearFilters}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        color: 'var(--secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Search Filter
                    </button>
                  )}
                </div>

                {isLoadingDb && defaultData.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 className="animate-spin" size={24} style={{ color: 'var(--secondary)' }} />
                  </div>
                ) : (
                  <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(explorerData.length > 0 ? explorerData : defaultData).map((item, idx) => {
                      if (agent === 'real_estate') {
                        return (
                          <div key={idx} className="explorer-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#fff' }}>{item.type} in {item.area}</span>
                              <span style={{ color: 'var(--secondary)', fontWeight: 700, fontSize: '0.85rem' }}>{formatCurrency(item.price)}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              <div>Beds: <strong>{item.bedrooms}</strong></div>
                              <div>Size: <strong>{item.size || item.Size_SqFt || '—'} sqft</strong></div>
                              <div>Yield: <strong style={{ color: '#10b981' }}>{item.yield}%</strong></div>
                              <div>Metro: <strong>{item.metro || 'N/A'}</strong></div>
                              <div>Developer: <strong>{item.developer || 'N/A'}</strong></div>
                              <div>ID: <strong>{item.id}</strong></div>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div key={idx} className="explorer-card" style={{ borderLeft: '3px solid #10b981' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#fff' }}>Customer ID: {item.Customer_ID}</span>
                              <span style={{
                                color: item.Loan_Approved === 'Yes' || item.Loan_Approved === 'Y' ? '#10b981' : '#ef4444',
                                fontWeight: 800,
                                fontSize: '0.7rem'
                              }}>
                                {item.Loan_Approved === 'Yes' || item.Loan_Approved === 'Y' ? 'APPROVED' : 'DECLINED'}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              <div>Nationality: <strong>{item.Nationality}</strong></div>
                              <div>Salary: <strong>{formatCurrency(item.Monthly_Salary)}</strong></div>
                              <div>Credit Score: <strong>{item.Credit_Score}</strong></div>
                              <div>Monthly EMI: <strong>{formatCurrency(item.Monthly_EMI_AED)}</strong></div>
                              <div>Age: <strong>{item.Age} yrs</strong></div>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: LEAD ANALYZER */}
            {activeRightTab === 'analysis' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                
                {/* 1. Loading state */}
                {isAnalyzing ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--secondary)' }} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>AI analyzing lead details...</span>
                  </div>
                ) : (
                  <>
                    {/* 2. Empty state / no analysis yet */}
                    {!analysisResult ? (
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        padding: '2rem'
                      }}>
                        <Sparkles size={36} style={{ opacity: 0.3, marginBottom: '10px', color: 'var(--secondary)' }} />
                        <h5 style={{ color: '#fff', fontSize: '0.9rem', marginBottom: '5px' }}>Lead Qualifier Offline</h5>
                        <p style={{ fontSize: '0.75rem', maxWidth: '300px', margin: '0 auto' }}>
                          AI will classify caller viability, extract requirements, and suggest next steps once a conversation is finished.
                        </p>
                      </div>
                    ) : (
                      /* 3. Analysis Dashboard */
                      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', paddingRight: '5px' }}>
                        
                        {/* Summary Header */}
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '12px',
                          padding: '1.2rem',
                          position: 'relative',
                          overflow: 'hidden'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>LEAD CLASSIFICATION</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              Confidence: <strong>{(analysisResult.confidence_score * 100).toFixed(0)}%</strong>
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <span style={{
                              fontSize: '1.1rem',
                              fontWeight: 900,
                              background: analysisResult.classification === 'Legit Client' 
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              {analysisResult.classification === 'Legit Client' ? <UserCheck size={18} style={{ color: '#10b981' }} /> : <XCircle size={18} style={{ color: '#ef4444' }} />}
                              {analysisResult.classification}
                            </span>
                          </div>

                          <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.4', margin: 0 }}>
                            {analysisResult.executive_summary}
                          </p>
                        </div>

                        {/* Extracted Specifications Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div className="explorer-card" style={{ margin: 0, padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>BUDGET</span>
                            <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{analysisResult.extracted_information?.budget || 'Not specified'}</strong>
                          </div>

                          <div className="explorer-card" style={{ margin: 0, padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>PROPERTY TYPE</span>
                            <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{analysisResult.extracted_information?.property_type || 'Not specified'}</strong>
                          </div>

                          <div className="explorer-card" style={{ margin: 0, padding: '10px 12px', gridColumn: 'span 2' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>LOCATION PREFERENCES</span>
                            <strong style={{ fontSize: '0.85rem', color: '#fff' }}>
                              {Array.isArray(analysisResult.extracted_information?.location_preferences) && analysisResult.extracted_information.location_preferences.length > 0
                                ? analysisResult.extracted_information.location_preferences.join(', ')
                                : 'Not specified'
                              }
                            </strong>
                          </div>

                          <div className="explorer-card" style={{ margin: 0, padding: '10px 12px', gridColumn: 'span 2' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>FINANCIAL / LOAN DETAILS</span>
                            <strong style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                              {analysisResult.extracted_information?.loan_viability || 'Not specified'}
                            </strong>
                          </div>
                        </div>

                        {/* Next Action Actionable Card */}
                        <div style={{
                          background: 'rgba(139, 92, 246, 0.05)',
                          border: '1px solid rgba(139, 92, 246, 0.15)',
                          borderRadius: '12px',
                          padding: '1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--secondary)', letterSpacing: '0.5px' }}>RECOMMENDED NEXT ACTION</span>
                          <p style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, margin: 0 }}>
                            {analysisResult.suggested_next_steps}
                          </p>
                        </div>

                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

      <style>{`
        .tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: var(--transition-smooth);
        }
        .tab-btn:hover {
          color: var(--text-primary);
        }
        .tab-btn.active {
          color: var(--secondary);
          border-bottom-color: var(--secondary);
        }
        .btn-sub-toggle {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: 6px 12px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 6px;
          transition: var(--transition-smooth);
        }
        .btn-sub-toggle:hover {
          color: var(--text-primary);
        }
        .btn-sub-toggle.active {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
        }
        
        /* Dialer Controls */
        .dial-call-btn {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #fff;
          border: none;
          border-radius: 9999px;
          padding: 12px 24px;
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
          transition: var(--transition-bounce);
        }
        .dial-call-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(16, 185, 129, 0.5);
        }
        
        .phone-action-btn {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-bounce);
        }
        .phone-action-btn.accept {
          background: #10b981;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }
        .phone-action-btn.accept:hover {
          transform: scale(1.1);
        }
        .phone-action-btn.decline {
          background: #ef4444;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        }
        .phone-action-btn.decline:hover {
          transform: scale(1.1);
        }
        
        .circle-control-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border-glass);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .circle-control-btn:hover {
          background: rgba(255,255,255,0.12);
        }
        .circle-control-btn.hangup {
          background: #ef4444;
          border: none;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        }
        .circle-control-btn.hangup:hover {
          transform: scale(1.05);
        }
        .circle-control-btn.muted {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
          color: #ef4444;
        }
        .circle-control-btn.listening {
          background: rgba(6, 182, 212, 0.15);
          border-color: var(--secondary);
          color: var(--secondary);
          animation: btnPulse 1.5s infinite;
        }
        
        .btn-mic-input {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-glass);
          color: var(--text-secondary);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .btn-mic-input:hover {
          background: rgba(255,255,255,0.08);
          color: var(--text-primary);
        }
        .btn-mic-input.active {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
          color: #ef4444;
          animation: micPulse 1.5s infinite;
        }
        
        .ringing-animation {
          animation: phoneShake 0.5s infinite;
        }
        .pulse-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          box-shadow: 0 0 8px #10b981;
          animation: pulseGlow 1.5s infinite alternate;
        }
        
        .explorer-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          border-radius: 8px;
          padding: 12px;
          transition: var(--transition-smooth);
        }
        .explorer-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
        }
        @keyframes micPulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes btnPulse {
          0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(6, 182, 212, 0); }
          100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
        }
        @keyframes pulseGlow {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes phoneShake {
          0%, 100% { transform: rotate(0); }
          10%, 30%, 50%, 70%, 90% { transform: rotate(-10deg); }
          20%, 40%, 60%, 80% { transform: rotate(10deg); }
        }
        @keyframes wavePulse {
          0%, 100% { transform: scaleY(0.15); }
          50% { transform: scaleY(1.0); }
        }
      `}</style>
    </section>
  );
};
