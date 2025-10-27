import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface UserConfig {
  name: string;
  signatures: {
    formal: string;
    casual: string;
    brief: string;
  };
  defaultTone: 'formal' | 'casual' | 'brief';
  aiContext: string;
  replyPreferences: {
    includeQuoted: boolean;
    defaultSignature: 'formal' | 'casual' | 'brief';
  };
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: UserConfig;
  private configPath: string;

  private constructor() {
    this.configPath = join(process.cwd(), 'config', 'user.json');
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private getDefaultConfig(): UserConfig {
    return {
      name: 'Samay',
      signatures: {
        formal: 'Regards,\nSamay',
        casual: 'Best,\nSamay',
        brief: '- samay'
      },
      defaultTone: 'casual',
      aiContext: 'I am a busy professional who values concise, actionable communication.',
      replyPreferences: {
        includeQuoted: true,
        defaultSignature: 'casual'
      }
    };
  }

  private loadConfig(): UserConfig {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(configData);
        // Merge with defaults to handle missing properties
        return { ...this.getDefaultConfig(), ...loaded };
      }
    } catch (error) {
      console.warn('Could not load user config, using defaults:', error);
    }
    return this.getDefaultConfig();
  }

  saveConfig(): void {
    try {
      const configDir = join(process.cwd(), 'config');
      if (!existsSync(configDir)) {
        require('fs').mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Could not save user config:', error);
    }
  }

  // Getters
  getName(): string {
    return this.config.name;
  }

  getSignature(type: 'formal' | 'casual' | 'brief' = 'casual'): string {
    return this.config.signatures[type];
  }

  getDefaultTone(): 'formal' | 'casual' | 'brief' {
    return this.config.defaultTone;
  }

  getAIContext(): string {
    return this.config.aiContext;
  }

  getReplyPreferences() {
    return this.config.replyPreferences;
  }

  // Setters
  setName(name: string): void {
    this.config.name = name;
    this.updateSignatures(name);
    this.saveConfig();
  }

  setSignature(type: 'formal' | 'casual' | 'brief', signature: string): void {
    this.config.signatures[type] = signature;
    this.saveConfig();
  }

  setDefaultTone(tone: 'formal' | 'casual' | 'brief'): void {
    this.config.defaultTone = tone;
    this.saveConfig();
  }

  setAIContext(context: string): void {
    this.config.aiContext = context;
    this.saveConfig();
  }

  private updateSignatures(name: string): void {
    this.config.signatures = {
      formal: `Regards,\n${name}`,
      casual: `Best,\n${name}`,
      brief: `- ${name.toLowerCase()}`
    };
  }

  // Helper for AI prompts
  getPersonalizedContext(): string {
    return `User context: ${this.config.aiContext}\nPreferred tone: ${this.config.defaultTone}\nName: ${this.config.name}`;
  }
}

export default ConfigManager;