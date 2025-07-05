# Obsidian Anki Plugin Development Plan

## Current State Analysis

### Implemented Features
- ✅ Basic plugin structure with ribbon icons
- ✅ Anki connection via `yanki-connect` library through service layer
- ✅ Status bar showing Anki connection status
- ✅ Flashcard insertion modal with note type selection
- ✅ Flashcard rendering in edit and reading mode
- ✅ Settings tab with note type caching (AnkiNoteType[])
- ✅ Periodic Anki connection checking (10s intervals)
- ✅ Note type and deck retrieval from Anki with structured data types

## Feature Roadmap

### Basic functionality
- Flashcard parsing warnings
  - Warning: unknown fields
  - Warning: invalid Anki template references
- Register commands in Obsidian command palette
- Hotkeys to insert flashcard and sync to anki

### Cloze flashcards special treatment
- Validate cloze markers
- Render the note differently
- Special syntax to embed cloze deletions within paragraphs
- Render as highlighted text when cursor is elsewhere

### Syncing
- Include the deck in when comparing flashcards
- Sync local images
- Sync other media (low priority)

## Technical Architecture Decisions

### Data Flow
1. **File Discovery**: Scan vault for markdown files
2. **Flashcard Extraction**: Parse flashcard blocks from files
3. **Anki Comparison**: Compare local flashcards with Anki collection
4. **User Confirmation**: Present changes for approval
5. **Sync Execution**: Apply changes to Anki
6. **Metadata Update**: Update Obsidian files with Anki IDs

### Flashcard Block Format
```flashcard
NoteType: Basic
AnkiId: 1234567890  # Added after sync
Front: Question content
Back: Answer content
Tags: 
  - topic1
  - topic2
```

### Anki Integration Strategy
- **Vault tags**: `obsidian-vault:vault-name` for vault identification and isolation
- **Backlink fields**: `ObsidianVault` and `ObsidianNote` fields auto-populated during sync
- **Clean field-based approach**: File path stored as field data, not encoded in tags

### Settings Configuration
- Anki deck selection (default: "Default")
- Sync confirmation preferences
- Keyboard shortcut customization
- Template preferences
- Media sync options

## Risk Mitigation
- **Data Loss**: Always backup before sync operations
- **Anki Connection**: Graceful handling of connection failures
- **Performance**: TBD
- **Conflicts**: When in doubt, avoid losing information and inform the user
