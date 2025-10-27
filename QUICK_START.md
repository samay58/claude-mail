# 📧 Claude Email Agent - Quick Start Guide

A streamlined, AI-powered terminal email client that prioritizes your messages and suggests smart replies.

## 🚀 What's New (Streamlined Version)

- **Single Composer**: One unified email editor for all modes
- **AI Suggestions**: Auto-generated reply drafts with Tab to cycle
- **Smart Badges**: Priority score + content tags in one view
- **Clean Navigation**: Simple keyboard shortcuts, no mode switching
- **Instant Actions**: 1-key replies, star, sync, and compose

## ⚡ Essential Shortcuts

### 📧 Navigation
- `j/k` or `↑/↓` - Navigate up/down emails
- `Enter` - Open email to read
- `ESC` - Go back to list
- `g/G` - Jump to top/bottom
- `Space/PgDn` - Page down
- `PgUp` - Page up

### ✍️ Email Actions
- `c` - Compose new email
- `r` - Reply to selected email
- `R` - Reply to all
- `f` - Forward email
- `1/2/3` - Send quick reply options (from detail view)

### 📊 Organization
- `t` - Star/unstar email
- `m` - Mark as read/unread
- `p` - Sort by priority
- `/` - Search emails

### 🔧 System
- `s` - Sync emails
- `q` - Quit application

## How to Reply to an Email

1. **Select email** with `j/k` arrows
2. **Press `Enter`** to open it
3. **See 3 quick reply options** at top
4. **Press `1`, `2`, or `3`** to send instantly
   OR
5. **Press `r`** for custom reply with AI suggestions

## 🤖 AI-Powered Features

### Smart Prioritization
- **🔴90+** - Urgent (red badge)
- **🟠70-89** - Important (orange badge)
- **🟢<70** - Normal (green badge)

### Content Tags
- **[ACTION]** - Requires your response
- **[MEETING]** - Calendar/meeting related
- **[QUESTION]** - Contains questions
- **[INVOICE]** - Payment/billing related
- **[SECURITY]** - Security alerts

### AI Reply Generation
1. **Open any email** and press `r` to reply
2. **AI automatically generates 3 draft options**:
   - Professional tone
   - Friendly tone
   - Brief response
3. **Press Tab** to cycle through options
4. **Press Enter** to use selected draft
5. **Edit and send** with `Ctrl+S`

## Email Composer Features

### Smart Composition
- **Tab** - Navigate between To/Subject/Body fields
- **Shift+Tab** - Navigate backward
- **Word count** - Shows in real-time
- **Auto-save** - Drafts saved automatically

### AI Integration
- **Auto-suggestions** appear when replying
- **Tab cycling** through AI options
- **Context-aware** drafts based on original email

### Keyboard Shortcuts in Composer
- `Ctrl+S` - Send email
- `Ctrl+D` - Save as draft
- `Tab` - Next field (or cycle AI suggestions)
- `ESC` - Cancel and return to list

## Understanding the Interface

### Header Information
```
✉️ Claude Mail — 42 emails • 3 urgent • 7 important 🟢 Online • 🤖 AI
```

### Email List Format
```
▶ 🔴85 ! [JD] John Doe → Meeting today?  2h ★
  🟢45   [MS] Marketing → Newsletter stats  1d
```

- `▶` - Currently selected
- `🔴85` - Priority badge (color + score)
- `!` - Urgency indicator
- `[JD]` - Sender initials
- `★` - Starred emails

### Footer Shortcuts
```
[Enter] Open  [c] Compose  [r] Reply  [/] Search  [p] Priority  [t] Star  [s] Sync  [q] Quit 🤖 AI ON
```

## 🎯 Efficient Workflow Tips

1. **Triage Fast**: Use priority badges to focus on urgent emails first
2. **Quick Replies**: Use 1/2/3 keys for common responses
3. **AI Assistance**: Let AI generate reply drafts, then customize
4. **Smart Search**: Use `/` to find emails by sender, subject, or content
5. **Star Important**: Use `t` to mark emails you need to return to

## Troubleshooting

### Email Not Sending?
- Check your `.env` file has EMAIL_ADDRESS and EMAIL_APP_PASSWORD
- Verify SMTP settings are correct
- Look for error messages in the terminal

### AI Not Working?
- Set ANTHROPIC_API_KEY in your `.env` file
- Check the 🤖 AI indicator in the header
- Without AI, you still get smart prioritization based on keywords

### Can't See Emails?
- Run `s` to sync with your email server
- Check IMAP settings in `.env`
- Verify network connection

The streamlined Claude Email Agent focuses on speed and simplicity while maintaining powerful AI features. Master these shortcuts and let AI handle the heavy lifting!