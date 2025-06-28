# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin called "Obsidian Anki" that syncs Obsidian notes to Anki flashcards. The plugin integrates with Anki via the `yanki-connect` library and provides:

- Ribbon icon for manual sync to Anki (currently connects but doesn't sync)
- Ribbon icon for inserting flashcards with note type selection
- Status bar indicator showing Anki connection status (🟢 connected / 🔴 disconnected)
- Plugin settings tab for configuration and note type cache management
- Real-time Anki connection monitoring (10-second intervals)
- Flashcard insertion modal with fuzzy search and field preview

## Development Commands

- `npm run dev` - Start development with watch mode (rebuilds on changes)
- `npm run build` - Build for production with type checking
- `npm run version` - Bump version in manifest.json and package.json

## Architecture

The plugin follows hexagonal architecture principles with clean separation between business logic and technical implementation:

- **Main entry point**: `main.ts` - Contains the `ObsidianAnkiPlugin` class
- **Settings management**: Handled through `PluginSettings` interface and `ObsidianAnkiSettingTab` class
- **Anki integration**: Uses hexagonal architecture with `AnkiService` interface (port) and `YankiConnectAnkiService` adapter
- **Domain layer**: `AnkiNoteType` and `AnkiNote` interfaces for structured data
- **Build system**: esbuild configuration in `esbuild.config.mjs` bundles TypeScript to `main.js`

## Key Components

- `ObsidianAnkiPlugin` - Main plugin class that handles initialization, commands, and Anki connection
- `AnkiService` - Interface (port) defining Anki operations needed by the application
- `YankiConnectAnkiService` - Adapter implementing AnkiService using yanki-connect library
- `FlashcardInsertModal` - Modal for selecting note types and inserting flashcard blocks
- `FlashcardRenderer` - Renders valid flashcards with proper styling and markdown support
- `FlashcardCodeBlockProcessor` - Orchestrates flashcard code block processing and error display
- `BlockFlashcardParser` - Parses YAML-formatted flashcard content with detailed error reporting
- `ObsidianAnkiSettingTab` - Settings interface for plugin configuration and note type cache
- `SyncProgressModal` - Modal for vault scanning and sync progress tracking
- `SyncConfirmationModal` - Modal for reviewing and confirming sync changes
- `SampleModal` - Legacy modal component (should be removed in cleanup)

## Flashcard Format

The plugin uses YAML-formatted code blocks for flashcards:

```flashcard
NoteType: Basic
Front: Question content
Back: Answer content
Tags:
  - topic1
  - topic2
```

**Important**: Tags must be formatted as a YAML list using the dash syntax. String formats like `Tags: "topic1, topic2"` are not supported and will cause parsing errors.

## Tag Filtering

The plugin supports ignoring specific tags during sync operations to avoid unnecessary changes:

- **Ignored Tags**: Configure tags to ignore during sync in plugin settings (default: `marked`, `leech`)
- **Automatic Filtering**: These tags are filtered out when converting Anki notes to flashcards and during tag comparison
- **No False Changes**: Cards won't be marked as "changed" just because of ignored tag differences
- **Import Support**: Ignored tags are also filtered when importing orphaned Anki cards back to Obsidian

## Flashcard Rendering

The plugin now includes comprehensive flashcard rendering with:

- **Visual flashcard display** - Styled cards with note type headers, field content, and tags
- **Error handling** - Invalid flashcards show with red border and detailed error messages
- **Hover tooltips** - Error icons display specific parsing issues on hover
- **Markdown support** - Field content supports full Obsidian markdown rendering
- **Fallback display** - Invalid flashcards still show original YAML content for editing
- **Robust YAML parsing** - Uses js-yaml library for proper YAML syntax support
- **Advanced YAML features** - Supports multiline strings (|, >), arrays, quoted strings, and complex structures

### Obsidian Backlinks

The plugin doesn't automatically create backlinks from Anki to Obsidian. Instead, it provides a way to link back to
your Obsidian notes:
1. **Add special fields**: Include `ObsidianVault` and `ObsidianNote` fields in your Anki note types
2. **Auto-population**: Fields are automatically filled during sync with vault name and file path
3. **Create links**: Add `obsidian://open?vault={{ObsidianVault}}&file={{ObsidianNote}}` to your Anki card templates
4. **Click to open**: Click the link in Anki to jump directly to the source note in Obsidian

## Current Limitations & TODOs

- No keyboard shortcuts defined
- No cloze deletion syntax support
- Missing media file synchronization

## Development Notes

- The plugin requires Anki to be running with AnkiConnect addon for proper functionality
- TypeScript compilation uses strict null checks and targets ES6
- Plugin manifest shows it's compatible with Obsidian 0.15.0+
- Development build includes inline source maps for debugging
- Development plan and roadmap available at PLAN.md
- Settings store note types from last successful Anki connection for offline use
- Button states update based on active editor and available note types

## Testing

- Ensure Anki is running with AnkiConnect addon before testing
- Use `npm run dev` for live development with automatic rebuilds
- Test both connected and disconnected states
- Verify note types are cached properly in settings

## Next Development Priorities

1. Add keyboard shortcuts for common actions
2. Add cloze deletion syntax support
3. Implement media file synchronization
4. Add bulk operations for flashcard management
5. Improve error handling and user feedback

## Development Guidelines

- Don't commit changes to git unless being told
