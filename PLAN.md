# Obsidian Anki Plugin Development Plan

## Next release
- Setting to disable debugging logging
- Enable beta reviews with https://github.com/TfTHacker/obsidian42-brat

## Feature Roadmap

### Syncing
- Find Anki Notes when their ids are referenced even if they lack the `obsidian-*` tags
- Better error handling for note type mismatches
- Sync external media (`https://example.com/...`)
- Sync `data:` links
- Sync Obsidian image syntax (`![[image]]`)
- Sync other media (low priority)

### Import flashcard
- Button, palette action and shortcut to import a flashcard
- Modal to search for the card and preview what would be inserted

### Rendering
- Render math

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
