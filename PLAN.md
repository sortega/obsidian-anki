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

### Current Limitations
- ❌ Sync button performs full sync operations
  - ✅ Finds all cards in the vault via SyncProgressModal
  - ✅ Finds all managed cards in Anki via getManagedNoteIds()
  - ✅ Content comparison implemented in SyncConfirmationModal
  - ✅ Full CRUD operations for Anki cards (create, update, delete)
  - ❌ Bug in how it updates Obsidian files with anki_id after creation
  - ❌ No media file synchronization
- ❌ No keyboard shortcuts for any actions
- ❌ No cloze deletion syntax support

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

### Media syncing
- Sync local images
- Sync other media (low priority)

### Other
- Support for linking back to Obsidian notes

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
note_type: Basic
anki_id: 1234567890  # Added after sync
front: Question content
back: Answer content
tags: 
  - topic1
  - topic2
```

### Anki Tagging Strategy
- `obsidian-synced`: Universal tag for all synced cards
- `obsidian-vault:vault-name`: Vault identification
- `obsidian-file:path/to/file.md`: File path for backlinking

### Settings Configuration
- Anki deck selection (default: "Default")
- Sync confirmation preferences
- Keyboard shortcut customization
- Template preferences
- Media sync options

## Implementation Priority

### Immediate (Next Sprint)
1. ✅ Implement sync progress modal UI
2. ✅ Add file scanning and flashcard parsing logic  
3. ✅ Create Anki comparison functionality
4. ✅ Add basic CRUD operations for Anki cards
5. ✅ Implement sync execution with progress tracking
6. ✅ Add default deck configuration in settings

### Short Term (2-3 Sprints)
1. Add keyboard shortcuts and commands
2. Implement flashcard rendering in reading mode
3. Add cloze deletion syntax support

### Long Term (Future Releases)
1. Media synchronization
2. Advanced templating
3. Bidirectional sync
4. Performance optimizations

## Success Metrics
- ✅ Users can sync flashcards with single button click
- ✅ Progress is clearly communicated during sync
- ✅ No flashcards are lost or corrupted during sync
- ✅ Keyboard shortcuts improve workflow efficiency
- ✅ Flashcards render nicely in reading mode
- ✅ Multi-vault setups work without conflicts

## Risk Mitigation
- **Data Loss**: Always backup before sync operations
- **Anki Connection**: Graceful handling of connection failures
- **Performance**: TBD
- **Conflicts**: When in doubt, avoid losing information and inform the user
