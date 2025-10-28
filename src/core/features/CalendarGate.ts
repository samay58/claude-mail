/**
 * CalendarGate - RFC 5545 (iCalendar) compliant calendar event detection
 *
 * Detects calendar invitations and meeting requests using:
 * - Content-Type: text/calendar (RFC 5545)
 * - .ics attachments
 * - Meeting-related keywords and patterns
 * - Calendar service patterns (Google Calendar, Outlook, etc.)
 */

import { EmailHeaders } from './NewsletterGate.js';

export interface CalendarEventInfo {
  startTime?: Date;
  endTime?: Date;
  title?: string;
  location?: string;
  organizer?: string;
  isRecurring?: boolean;
  method?: 'REQUEST' | 'REPLY' | 'CANCEL' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER' | 'ADD' | 'PUBLISH';
}

export interface CalendarDetectionResult {
  hasCalendar: boolean;
  confidence: number; // 0.0 to 1.0
  eventInfo?: CalendarEventInfo;
  reasons: string[];
}

export class CalendarGate {
  /**
   * RFC 5545 iCalendar MIME types
   */
  private static readonly CALENDAR_MIME_TYPES = [
    'text/calendar',
    'application/ics',
    'text/x-vcalendar'
  ];

  /**
   * Common calendar service domains and patterns
   */
  private static readonly CALENDAR_SERVICES = [
    { domain: 'calendar.google.com', service: 'Google Calendar' },
    { domain: 'calendar-server.bounces.google.com', service: 'Google Calendar' },
    { domain: 'outlook.com', service: 'Outlook' },
    { domain: 'calendar.yahoo.com', service: 'Yahoo Calendar' },
    { domain: 'calendly.com', service: 'Calendly' },
    { domain: 'zoom.us', service: 'Zoom' },
    { domain: 'webex.com', service: 'WebEx' },
    { domain: 'teams.microsoft.com', service: 'Microsoft Teams' },
    { domain: 'gotomeeting.com', service: 'GoToMeeting' },
    { domain: 'bluejeans.com', service: 'BlueJeans' }
  ];

  /**
   * Meeting/Calendar keywords in subject
   */
  private static readonly CALENDAR_SUBJECT_PATTERNS = [
    // Direct invitations
    /invitation:|invite:|meeting invitation/i,
    /calendar invitation/i,
    /you('re| are) invited to/i,

    // Meeting notifications
    /meeting (request|reminder|update|cancelled?|rescheduled)/i,
    /\[(new |updated |cancelled? )?meeting\]/i,
    /reminder: .* meeting/i,

    // Calendar-specific
    /accepted:|declined:|tentative:|cancelled?:/i,
    /has (accepted|declined|tentatively accepted) your (meeting|event|invitation)/i,

    // Time-based patterns
    /scheduled for .* at \d+:\d+/i,
    /\d{1,2}:\d{2}\s*(am|pm|[ap]\.m\.)/i,

    // Webinar/Event patterns
    /webinar invitation/i,
    /event registration/i,
    /save the date/i
  ];

  /**
   * Meeting keywords in body text
   */
  private static readonly CALENDAR_BODY_PATTERNS = [
    // Meeting links
    /join\s+(the\s+)?(meeting|call|conference|webinar)/i,
    /meeting\s+link:|join\s+link:/i,
    /click\s+here\s+to\s+join/i,
    /zoom\.us\/j\//i,
    /teams\.microsoft\.com\/l\/meetup/i,
    /meet\.google\.com\//i,
    /webex\.com\/meet/i,

    // Calendar actions
    /add\s+to\s+(your\s+)?calendar/i,
    /accept\s+or\s+decline/i,
    /rsvp/i,
    /save\s+this\s+event/i,

    // Time and location
    /when:\s*.+\n/i,
    /where:\s*.+\n/i,
    /time:\s*\d+:\d+/i,
    /date:\s*.+\d{4}/i,
    /location:\s*.+/i,

    // Agenda patterns
    /agenda:/i,
    /dial[- ]?in:/i,
    /meeting\s+id:/i,
    /passcode:|password:/i
  ];

  /**
   * Main detection method - combines all detection strategies
   */
  static detect(
    senderEmail: string,
    headers?: EmailHeaders,
    subject?: string,
    bodyText?: string,
    attachments?: Array<{ filename: string; contentType: string }>,
    contentType?: string
  ): CalendarDetectionResult {
    const reasons: string[] = [];
    let confidence = 0;
    let eventInfo: CalendarEventInfo | undefined;

    // 1. Check Content-Type for text/calendar (RFC 5545) - highest confidence
    if (contentType && this.CALENDAR_MIME_TYPES.some(mime => contentType.includes(mime))) {
      confidence = 1.0; // 100% confidence - this IS a calendar event
      reasons.push(`Content-Type is ${contentType} (RFC 5545)`);

      // Try to extract event info if we have the calendar data
      if (bodyText?.includes('BEGIN:VCALENDAR')) {
        eventInfo = this.parseVCalendar(bodyText);
      }
    }

    // 2. Check for .ics attachments
    if (attachments) {
      const icsAttachment = attachments.find(att =>
        att.filename.endsWith('.ics') ||
        att.filename.endsWith('.vcs') ||
        this.CALENDAR_MIME_TYPES.some(mime => att.contentType?.includes(mime))
      );

      if (icsAttachment) {
        confidence = Math.max(confidence, 0.95);
        reasons.push(`Has calendar attachment: ${icsAttachment.filename}`);
      }
    }

    // 3. Check if from calendar service
    const calendarService = this.checkCalendarService(senderEmail);
    if (calendarService) {
      confidence = Math.max(confidence, 0.90);
      reasons.push(`From calendar service: ${calendarService.service}`);
    }

    // 4. Check subject patterns
    if (subject) {
      for (const pattern of this.CALENDAR_SUBJECT_PATTERNS) {
        if (pattern.test(subject)) {
          confidence = Math.max(confidence, 0.85);
          reasons.push(`Subject matches calendar pattern: ${pattern.source}`);

          // Try to extract time from subject
          const timeMatch = subject.match(/(\d{1,2}):(\d{2})\s*(am|pm|[ap]\.m\.)?/i);
          if (timeMatch && !eventInfo) {
            eventInfo = { title: subject };
          }
          break;
        }
      }

      // Check for specific meeting status in subject
      if (/accepted:|declined:|tentative:/i.test(subject)) {
        confidence = Math.max(confidence, 0.80);
        reasons.push('Subject indicates meeting response');
      }
    }

    // 5. Check body patterns (lower confidence unless multiple matches)
    if (bodyText) {
      const bodySnippet = bodyText.substring(0, 1500); // Check first 1500 chars
      let patternMatches = 0;

      for (const pattern of this.CALENDAR_BODY_PATTERNS) {
        if (pattern.test(bodySnippet)) {
          patternMatches++;
        }
      }

      if (patternMatches > 0) {
        // Scale confidence based on number of patterns matched
        const bodyConfidence = Math.min(0.70 + (patternMatches * 0.05), 0.85);
        confidence = Math.max(confidence, bodyConfidence);
        reasons.push(`Body contains ${patternMatches} calendar pattern(s)`);

        // Try to extract meeting info from body
        if (!eventInfo) {
          eventInfo = this.extractEventInfoFromText(bodySnippet);
        }
      }
    }

    // 6. Check for calendar-specific headers
    if (headers) {
      // Microsoft Exchange calendar headers
      if (headers['x-microsoft-exchange-calendar-series-instance-id'] ||
          headers['x-ms-exchange-calendar-series-master-id']) {
        confidence = Math.max(confidence, 0.90);
        reasons.push('Has Microsoft Exchange calendar headers');
      }

      // Generic calendar headers
      if (headers['x-meetup-event'] || headers['x-eventbrite-event']) {
        confidence = Math.max(confidence, 0.85);
        reasons.push('Has event platform headers');
      }
    }

    return {
      hasCalendar: confidence >= 0.70, // 70% confidence threshold
      confidence,
      eventInfo: confidence >= 0.70 ? eventInfo : undefined,
      reasons
    };
  }

  /**
   * Check if sender is from a known calendar service
   */
  private static checkCalendarService(email: string): { domain: string; service: string } | null {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    for (const service of this.CALENDAR_SERVICES) {
      if (domain.includes(service.domain)) {
        return service;
      }
    }

    // Check for calendar-related subdomains
    if (domain.includes('calendar') || domain.includes('events') || domain.includes('meeting')) {
      return { domain, service: 'Unknown Calendar Service' };
    }

    return null;
  }

  /**
   * Parse VCALENDAR content (simplified parser for basic info)
   */
  private static parseVCalendar(content: string): CalendarEventInfo {
    const info: CalendarEventInfo = {};

    // Extract method
    const methodMatch = content.match(/METHOD:(\w+)/);
    if (methodMatch) {
      info.method = methodMatch[1] as CalendarEventInfo['method'];
    }

    // Extract summary/title
    const summaryMatch = content.match(/SUMMARY:(.+?)(?:\r?\n|$)/);
    if (summaryMatch) {
      info.title = summaryMatch[1].replace(/\\n/g, ' ').replace(/\\,/g, ',');
    }

    // Extract location
    const locationMatch = content.match(/LOCATION:(.+?)(?:\r?\n|$)/);
    if (locationMatch) {
      info.location = locationMatch[1].replace(/\\n/g, ' ').replace(/\\,/g, ',');
    }

    // Extract organizer
    const organizerMatch = content.match(/ORGANIZER(?:;[^:]+)?:(.+?)(?:\r?\n|$)/);
    if (organizerMatch) {
      const organizer = organizerMatch[1];
      // Extract email from mailto: or CN (common name)
      const emailMatch = organizer.match(/mailto:(.+)/i);
      if (emailMatch) {
        info.organizer = emailMatch[1];
      }
    }

    // Extract start time
    const startMatch = content.match(/DTSTART(?:;[^:]+)?:(\d{8}T\d{6}Z?)/);
    if (startMatch) {
      info.startTime = this.parseICalDate(startMatch[1]);
    }

    // Extract end time
    const endMatch = content.match(/DTEND(?:;[^:]+)?:(\d{8}T\d{6}Z?)/);
    if (endMatch) {
      info.endTime = this.parseICalDate(endMatch[1]);
    }

    // Check for recurring event
    if (content.includes('RRULE:')) {
      info.isRecurring = true;
    }

    return info;
  }

  /**
   * Parse iCalendar date format (YYYYMMDDTHHMMSSZ)
   */
  private static parseICalDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // 0-indexed
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(9, 11));
    const minute = parseInt(dateStr.substring(11, 13));
    const second = parseInt(dateStr.substring(13, 15));

    if (dateStr.endsWith('Z')) {
      // UTC time
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      // Local time
      return new Date(year, month, day, hour, minute, second);
    }
  }

  /**
   * Extract event info from plain text (best effort)
   */
  private static extractEventInfoFromText(text: string): CalendarEventInfo | undefined {
    const info: CalendarEventInfo = {};

    // Try to find When/Time
    const whenMatch = text.match(/when:\s*(.+?)(?:\n|$)/i);
    if (whenMatch) {
      // Try to parse date/time (simplified)
      const dateStr = whenMatch[1];
      // This would need more sophisticated date parsing in production
      info.title = `Meeting on ${dateStr}`;
    }

    // Try to find Where/Location
    const whereMatch = text.match(/(?:where|location):\s*(.+?)(?:\n|$)/i);
    if (whereMatch) {
      info.location = whereMatch[1].trim();
    }

    // Try to find meeting link
    const linkPatterns = [
      /zoom\.us\/j\/(\d+)/i,
      /teams\.microsoft\.com\/l\/meetup[^\\s]+/i,
      /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i
    ];

    for (const pattern of linkPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (!info.location) {
          info.location = 'Online Meeting';
        }
        break;
      }
    }

    return Object.keys(info).length > 0 ? info : undefined;
  }

  /**
   * Utility to extract meeting time from text
   */
  static extractMeetingTime(text: string): { date?: Date; timeStr?: string } | null {
    // Common patterns for meeting times
    const patterns = [
      // "Monday, January 15, 2024 at 2:00 PM"
      /(\w+),\s+(\w+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i,
      // "Jan 15, 2024 2:00pm"
      /(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i,
      // "2024-01-15 14:00"
      /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/i,
      // "15/01/2024 at 2pm"
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2})(am|pm)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Return the matched time string
        // In production, would parse this into a proper Date object
        return { timeStr: match[0] };
      }
    }

    return null;
  }
}