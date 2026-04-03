/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Square, 
  Image as ImageIcon, 
  Video, 
  Send, 
  Cpu, 
  Zap, 
  Volume2, 
  VolumeX,
  History,
  Settings,
  Trash2,
  Loader2,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';
import { Mode, Message, JarvisState } from './types';

const INITIAL_STATE: JarvisState = {
  messages: [
    {
      id: '1',
      role: 'assistant',
      content: 'System online. Jarvis at your service. How can I assist you today?',
      type: 'text',
      timestamp: Date.now(),
    }
  ],
  memory: [],
  currentMode: 'Fast',
  isListening: false,
  isSpeaking: false,
  isProcessing: false,
};

export default function App() {
  const [state, setState] = useState<JarvisState>(INITIAL_STATE);
  const [input, setInput] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  useEffect(() => {
    // Check for speech recognition support
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setSpeechSupported(true);
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setState(prev => ({ ...prev, isListening: false }));
      };

      recognitionRef.current.onend = () => {
        setState(prev => ({ ...prev, isListening: false }));
      };
    }

    synthRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages]);

  const speak = (text: string) => {
    if (!synthRef.current || state.currentMode === 'Fast') return;

    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find a good robotic voice
    const voices = synthRef.current.getVoices();
    const jarvisVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Male'));
    if (jarvisVoice) utterance.voice = jarvisVoice;
    
    utterance.pitch = 0.9;
    utterance.rate = 1.0;

    utterance.onstart = () => setState(prev => ({ ...prev, isSpeaking: true }));
    utterance.onend = () => setState(prev => ({ ...prev, isSpeaking: false }));
    
    synthRef.current.speak(utterance);
  };

  const toggleListening = () => {
    if (state.isListening) {
      recognitionRef.current?.stop();
      setState(prev => ({ ...prev, isListening: false }));
      if (input.trim()) handleSend();
    } else {
      setInput('');
      recognitionRef.current?.start();
      setState(prev => ({ ...prev, isListening: true }));
    }
  };

  const handleSend = async (overrideInput?: string, type: 'text' | 'image' | 'script' = 'text') => {
    const query = overrideInput || input;
    if (!query.trim() || state.isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      type: 'text',
      timestamp: Date.now(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isProcessing: true,
      memory: [query, ...prev.memory].slice(0, 5)
    }));
    setInput('');

    try {
      if (type === 'image') {
        await generateImage(query);
      } else if (type === 'script') {
        await generateScript(query);
      } else {
        await generateChatResponse(query);
      }
    } catch (error) {
      console.error("Jarvis Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered a system error while processing your request.",
        type: 'text',
        timestamp: Date.now(),
      };
      setState(prev => ({ ...prev, messages: [...prev.messages, errorMessage], isProcessing: false }));
    }
  };

  const generateChatResponse = async (query: string) => {
    const memoryContext = state.memory.length > 0 
      ? `\nRecent memory: ${state.memory.join(', ')}` 
      : '';
    
    const prompt = `You are Jarvis, a futuristic AI assistant. Be concise, professional, and helpful. Current mode: ${state.currentMode}.${memoryContext}\nUser: ${query}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const text = response.text || "I'm unable to provide a response at this moment.";
    
    const assistantMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: text,
      type: 'text',
      timestamp: Date.now(),
    };

    setState(prev => ({ ...prev, messages: [...prev.messages, assistantMessage], isProcessing: false }));
    
    if (state.currentMode === 'Voice' || state.isListening) {
      speak(text);
    }
  };

  const generateImage = async (query: string) => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A futuristic, high-quality image of: ${query}` }],
      },
    });

    let imageUrl = '';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    const assistantMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Generated image for: ${query}`,
      type: 'image',
      imageUrl,
      timestamp: Date.now(),
    };

    setState(prev => ({ ...prev, messages: [...prev.messages, assistantMessage], isProcessing: false }));
    speak("Image generation complete.");
  };

  const generateScript = async (query: string) => {
    const prompt = `Generate a professional video script for: ${query}. Include scenes, dialogue, and camera directions. Format it clearly.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const text = response.text || "Failed to generate script.";
    
    const assistantMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: text,
      type: 'script',
      timestamp: Date.now(),
    };

    setState(prev => ({ ...prev, messages: [...prev.messages, assistantMessage], isProcessing: false }));
    speak("Video script has been prepared.");
  };

  const clearChat = () => {
    setState(prev => ({ ...prev, messages: [INITIAL_STATE.messages[0]], memory: [] }));
  };

  return (
    <div className="flex flex-col h-screen bg-jarvis-dark text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-jarvis-cyan/20 flex items-center justify-between px-6 bg-jarvis-card/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-jarvis-cyan flex items-center justify-center glow-cyan animate-pulse">
            <Cpu className="text-jarvis-cyan w-6 h-6" />
          </div>
          <div>
            <h1 className="font-orbitron font-bold text-xl tracking-wider text-glow-cyan text-jarvis-cyan">JARVIS</h1>
            <p className="text-[10px] text-jarvis-cyan/60 font-mono uppercase tracking-widest">System v4.0.1</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-jarvis-cyan/10 border border-jarvis-cyan/20">
            <div className={cn("w-2 h-2 rounded-full", state.isProcessing ? "bg-yellow-400 animate-pulse" : "bg-jarvis-cyan")} />
            <span className="text-[10px] font-mono text-jarvis-cyan uppercase">
              {state.isProcessing ? 'Processing...' : 'Ready'}
            </span>
          </div>
          <button onClick={clearChat} className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400 hover:text-red-400">
            <Trash2 size={20} />
          </button>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Sidebar - Modes & Memory */}
        <aside className="w-full md:w-64 border-r border-jarvis-cyan/10 bg-jarvis-card/30 p-4 flex flex-col gap-6">
          <div>
            <h3 className="text-xs font-mono text-jarvis-cyan/60 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap size={14} /> Operation Modes
            </h3>
            <div className="flex flex-col gap-2">
              {(['Creator', 'Fast', 'Voice'] as Mode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setState(prev => ({ ...prev, currentMode: mode }))}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-300",
                    state.currentMode === mode 
                      ? "bg-jarvis-cyan/10 border-jarvis-cyan text-jarvis-cyan glow-cyan" 
                      : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
                  )}
                >
                  <span className="font-orbitron text-sm">{mode}</span>
                  {mode === 'Creator' && <ImageIcon size={16} />}
                  {mode === 'Fast' && <Zap size={16} />}
                  {mode === 'Voice' && <Volume2 size={16} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-mono text-jarvis-cyan/60 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History size={14} /> Short-term Memory
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {state.memory.length === 0 ? (
                <p className="text-xs text-gray-600 italic">No recent commands...</p>
              ) : (
                state.memory.map((item, i) => (
                  <div key={i} className="p-2 rounded bg-white/5 border border-white/5 text-[11px] text-gray-400 font-mono truncate">
                    {item}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <section className="flex-1 flex flex-col bg-jarvis-dark/50 relative overflow-hidden">
          {/* Background Grid Effect */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(circle, #00f2ff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-0"
          >
            <AnimatePresence initial={false}>
              {state.messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={cn(
                    "flex flex-col max-w-[85%] md:max-w-[70%]",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className={cn(
                    "px-4 py-3 rounded-2xl jarvis-border",
                    msg.role === 'user' 
                      ? "bg-jarvis-blue/20 border-jarvis-blue/30 text-white rounded-tr-none" 
                      : "bg-jarvis-cyan/10 border-jarvis-cyan/30 text-jarvis-cyan/90 rounded-tl-none jarvis-gradient"
                  )}>
                    {msg.type === 'image' && msg.imageUrl ? (
                      <div className="space-y-3">
                        <img 
                          src={msg.imageUrl} 
                          alt="Generated" 
                          className="rounded-lg w-full h-auto border border-jarvis-cyan/30 glow-cyan"
                          referrerPolicy="no-referrer"
                        />
                        <p className="text-sm italic opacity-70">{msg.content}</p>
                      </div>
                    ) : (
                      <div className={cn("text-sm leading-relaxed whitespace-pre-wrap", msg.type === 'script' && "font-mono text-xs")}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-gray-600 mt-1 uppercase tracking-tighter">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {state.isProcessing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-jarvis-cyan/60 font-mono text-xs"
              >
                <Loader2 className="animate-spin" size={14} />
                <span>Jarvis is thinking...</span>
              </motion.div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 md:p-6 border-t border-jarvis-cyan/10 bg-jarvis-card/80 backdrop-blur-xl">
            <div className="max-w-4xl mx-auto flex flex-col gap-4">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => handleSend(undefined, 'image')}
                  disabled={state.isProcessing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-jarvis-cyan/5 border border-jarvis-cyan/20 text-jarvis-cyan text-[10px] font-mono uppercase tracking-wider hover:bg-jarvis-cyan/20 transition-all disabled:opacity-50"
                >
                  <ImageIcon size={12} /> Generate Image
                </button>
                <button 
                  onClick={() => handleSend(undefined, 'script')}
                  disabled={state.isProcessing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-jarvis-cyan/5 border border-jarvis-cyan/20 text-jarvis-cyan text-[10px] font-mono uppercase tracking-wider hover:bg-jarvis-cyan/20 transition-all disabled:opacity-50"
                >
                  <Video size={12} /> Video Script
                </button>
                <button 
                  onClick={() => setInput("System status check")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-400 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 transition-all"
                >
                  <Terminal size={12} /> Status Check
                </button>
              </div>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 relative group">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={state.isListening ? "Listening..." : "Enter command..."}
                    className={cn(
                      "w-full bg-jarvis-dark/80 border border-jarvis-cyan/20 rounded-xl px-5 py-4 text-sm focus:outline-none focus:border-jarvis-cyan/50 transition-all font-mono",
                      state.isListening && "border-jarvis-cyan glow-cyan animate-pulse"
                    )}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {speechSupported && (
                      <button
                        onClick={toggleListening}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          state.isListening ? "bg-red-500/20 text-red-500" : "text-jarvis-cyan hover:bg-jarvis-cyan/10"
                        )}
                      >
                        {state.isListening ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || state.isProcessing}
                  className="p-4 bg-jarvis-cyan text-jarvis-dark rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 glow-cyan"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Visualizer Footer */}
      <footer className="h-12 border-t border-jarvis-cyan/10 bg-jarvis-card flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <motion.div
                key={i}
                animate={{ 
                  height: state.isSpeaking || state.isListening ? [4, 16, 8, 20, 4] : 4 
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 0.5, 
                  delay: i * 0.05 
                }}
                className="w-1 bg-jarvis-cyan rounded-full"
              />
            ))}
          </div>
          <span className="text-[10px] font-mono text-jarvis-cyan/60 uppercase tracking-widest">
            {state.isSpeaking ? 'Voice Output Active' : state.isListening ? 'Voice Input Active' : 'Neural Link Stable'}
          </span>
        </div>
        
        <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <span>CPU: 12%</span>
          <span>MEM: 4.2GB</span>
          <span className="text-jarvis-cyan/40">Lat: 24ms</span>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 242, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 242, 255, 0.3);
        }
      `}} />
    </div>
  );
}
