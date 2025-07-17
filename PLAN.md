# Obsidian Anki Plugin Development Plan

## Feature Roadmap

### Basic functionality

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
- **Backlinks**: implemented by adding a bit of JavaScript to Anki Note templates manually (by the user)
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
