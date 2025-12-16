/**
 * UserPreferences - Personalized scoring based on user-defined rules
 *
 * Loads preferences from config/user-preferences.json and provides
 * methods to check if an email matches VIP, important service, or
 * valuable newsletter patterns.
 *
 * Priority hierarchy:
 * 1. VIP contacts → score override to 100 (urgent)
 * 2. Important services → score floor of 75 (important)
 * 3. Valuable newsletters → treated as normal, not spam
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface VIPPattern {
  type: 'email' | 'email_contains' | 'domain' | 'name_contains';
  value: string;
  reason: string;
}

interface NewsletterPattern {
  type: 'sender_contains' | 'subject_contains' | 'domain';
  value: string;
  reason: string;
}

interface UserPreferencesConfig {
  version: string;
  lastUpdated: string;
  vip: {
    description: string;
    patterns: VIPPattern[];
  };
  self: {
    description: string;
    patterns: VIPPattern[];
  };
  importantServices: {
    description: string;
    domains: string[];
  };
  valuableNewsletters: {
    description: string;
    patterns: NewsletterPattern[];
  };
  recruitersOfInterest: {
    description: string;
    names: string[];
  };
}

export interface PreferenceMatch {
  isVIP: boolean;
  isSelf: boolean;
  isImportantService: boolean;
  isValuableNewsletter: boolean;
  isRecruiterOfInterest: boolean;
  reason?: string;
}

export class UserPreferences {
  private static instance: UserPreferences;
  private config: UserPreferencesConfig | null = null;
  private configPath: string;

  private constructor() {
    // Find config path relative to project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Go up from dist/core or src/core to project root
    this.configPath = join(__dirname, '..', '..', 'config', 'user-preferences.json');

    // Also try alternate path (when running from dist)
    if (!existsSync(this.configPath)) {
      this.configPath = join(__dirname, '..', '..', '..', 'config', 'user-preferences.json');
    }

    this.loadConfig();
  }

  static getInstance(): UserPreferences {
    if (!UserPreferences.instance) {
      UserPreferences.instance = new UserPreferences();
    }
    return UserPreferences.instance;
  }

  private loadConfig(): void {
    try {
      if (existsSync(this.configPath)) {
        const content = readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(content);
        console.log(`[UserPreferences] Loaded config from ${this.configPath}`);
      } else {
        console.log(`[UserPreferences] No config file found at ${this.configPath}`);
      }
    } catch (error) {
      console.error('[UserPreferences] Failed to load config:', error);
    }
  }

  /**
   * Reload config (useful after manual edits)
   */
  reload(): void {
    this.loadConfig();
  }

  /**
   * Check if email matches any user preference patterns
   */
  checkEmail(
    senderEmail: string,
    senderName: string,
    subject: string
  ): PreferenceMatch {
    const result: PreferenceMatch = {
      isVIP: false,
      isSelf: false,
      isImportantService: false,
      isValuableNewsletter: false,
      isRecruiterOfInterest: false
    };

    if (!this.config) return result;

    // Defensive handling for undefined/null values
    const email = (senderEmail || '').toLowerCase();
    const name = (senderName || '').toLowerCase();
    const subj = (subject || '').toLowerCase();
    const domain = email.split('@')[1] || '';

    // Check VIP patterns
    for (const pattern of this.config.vip.patterns) {
      let matches = false;

      switch (pattern.type) {
        case 'email':
          matches = email === pattern.value.toLowerCase();
          break;
        case 'email_contains':
          matches = email.includes(pattern.value.toLowerCase());
          break;
        case 'domain':
          matches = domain === pattern.value.toLowerCase() ||
                    domain.endsWith('.' + pattern.value.toLowerCase());
          break;
        case 'name_contains':
          matches = name.includes(pattern.value.toLowerCase());
          break;
      }

      if (matches) {
        result.isVIP = true;
        result.reason = pattern.reason;
        return result; // VIP overrides everything
      }
    }

    // Check self patterns (important but not urgent)
    if (this.config.self?.patterns) {
      for (const pattern of this.config.self.patterns) {
        let matches = false;

        switch (pattern.type) {
          case 'email':
            matches = email === pattern.value.toLowerCase();
            break;
          case 'email_contains':
            matches = email.includes(pattern.value.toLowerCase());
            break;
          case 'domain':
            matches = domain === pattern.value.toLowerCase() ||
                      domain.endsWith('.' + pattern.value.toLowerCase());
            break;
        }

        if (matches) {
          result.isSelf = true;
          result.reason = pattern.reason;
          return result; // Self returns early (important tier)
        }
      }
    }

    // Check important service domains
    for (const serviceDomain of this.config.importantServices.domains) {
      if (domain === serviceDomain.toLowerCase() ||
          domain.endsWith('.' + serviceDomain.toLowerCase()) ||
          email.includes(serviceDomain.toLowerCase())) {
        result.isImportantService = true;
        result.reason = `Important service: ${serviceDomain}`;
        break;
      }
    }

    // Check valuable newsletter patterns
    for (const pattern of this.config.valuableNewsletters.patterns) {
      let matches = false;

      switch (pattern.type) {
        case 'sender_contains':
          matches = email.includes(pattern.value.toLowerCase()) ||
                    name.includes(pattern.value.toLowerCase());
          break;
        case 'subject_contains':
          matches = subj.includes(pattern.value.toLowerCase());
          break;
        case 'domain':
          matches = domain === pattern.value.toLowerCase();
          break;
      }

      if (matches) {
        result.isValuableNewsletter = true;
        result.reason = pattern.reason;
        break;
      }
    }

    // Check recruiters of interest
    for (const recruiterName of this.config.recruitersOfInterest.names) {
      if (name.includes(recruiterName.toLowerCase()) ||
          email.includes(recruiterName.toLowerCase().replace(/\s+/g, ''))) {
        result.isRecruiterOfInterest = true;
        result.reason = `Recruiter: ${recruiterName}`;
        break;
      }
    }

    return result;
  }

  /**
   * Get all VIP patterns (for display/debugging)
   */
  getVIPPatterns(): VIPPattern[] {
    return this.config?.vip.patterns || [];
  }

  /**
   * Get all important service domains (for display/debugging)
   */
  getImportantServiceDomains(): string[] {
    return this.config?.importantServices.domains || [];
  }

  /**
   * Check if config is loaded
   */
  isConfigured(): boolean {
    return this.config !== null;
  }
}
