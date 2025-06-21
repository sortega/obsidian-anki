# Obsidian Anki Plugin Development Plan

## Current State Analysis

### Implemented Features
- ✅ Basic plugin structure with ribbon icons
- ✅ Anki connection via `yanki-connect` library
- ✅ Status bar showing Anki connection status
- ✅ Flashcard insertion modal with note type selection
- ✅ Flashcard rendering in edit and reading mode
- ✅ Settings tab with note type caching
- ✅ Periodic Anki connection checking (10s intervals)
- ✅ Note type and deck retrieval from Anki

### Current Limitations
- 🔄 Sync button exists but performs no actual syncing
- ❌ No keyboard shortcuts for any actions
- ❌ No progress tracking for sync operations
- ❌ No media file synchronization
- ❌ No cloze deletion syntax support
- ❌ No bidirectional sync capability

## Feature Roadmap

### Phase 1: Core Sync Functionality
**Priority: High**

#### 1.1 Sync Progress Modal
- Create a comprehensive modal for tracking sync operations
- Progress indicators for:
  - File scanning phase (files processed vs total)
  - Flashcard discovery phase (flashcards found)
  - Anki comparison phase (comparing local vs remote cards)
  - Change application phase (if needed)
- User confirmation dialog: "Create X cards, update Y cards, delete Z cards?"

#### 1.2 Flashcard Detection & Processing
- Parse all markdown files for `flashcard` code blocks
- Extract flashcard metadata (note_type, fields, existing anki_id if present)
- Build comprehensive flashcard inventory

#### 1.3 Anki Integration Strategy
- Use tags for organization:
  - `obsidian-synced`: Mark cards as coming from Obsidian
  - `obsidian-vault:VAULT_NAME`: Enable multi-vault support
  - `obsidian-file:FILE_PATH`: Enable file-level tracking
- Implement CRUD operations:
  - Create new cards in Anki
  - Update existing cards
  - Delete removed cards
  - Add `anki_id` field to YAML front matter after creation

### Phase 2: Enhanced User Experience
**Priority: Medium**

#### 2.1 Keyboard Shortcuts
- Add configurable hotkeys for:
  - Insert flashcard: `Ctrl+Shift+F`
  - Sync to Anki: `Ctrl+Shift+S`
- Register commands in Obsidian command palette

#### 2.2 Flashcard Rendering
- Implement live preview rendering for flashcard blocks
- Style flashcards similar to code blocks when cursor is outside
- Show field labels and content clearly
- Add visual indicators for synced vs unsynced cards

#### 2.3 Cloze Deletion Support
- Create specialized syntax: `{{c1::text to hide}}`
- Allow inline cloze cards within paragraphs
- Render as highlighted text when cursor is elsewhere
- Convert to Anki cloze format during sync

### Phase 3: Advanced Features
**Priority: Low**

#### 3.1 Media Synchronization
- Detect local image references in flashcard content
- Use Anki's media sync API to transfer files
- Update references to use Anki media format
- Support for audio files (future consideration)

#### 3.2 Template System
- HTML template generation for Anki cards
- Support for linking back to Obsidian notes
- Customizable card styling
- Field mapping configurations

#### 3.3 Bidirectional Sync
- Detect changes made in Anki
- Prompt user for conflict resolution
- Update Obsidian flashcards with Anki changes
- Maintain sync state tracking

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
1. Implement sync progress modal UI
2. Add file scanning and flashcard parsing logic
3. Create Anki comparison functionality
4. Add basic CRUD operations for Anki cards

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
