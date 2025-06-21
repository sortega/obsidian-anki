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

The plugin follows standard Obsidian plugin patterns:

- **Main entry point**: `main.ts` - Contains the `ObsidianAnkiPlugin` class
- **Settings management**: Handled through `MyPluginSettings` interface and `ObsidianAnkiSettingTab` class
- **Anki integration**: Uses `YankiConnect` from `yanki-connect` library for Anki communication
- **Build system**: esbuild configuration in `esbuild.config.mjs` bundles TypeScript to `main.js`

## Key Components

- `ObsidianAnkiPlugin` - Main plugin class that handles initialization, commands, and Anki connection
- `FlashcardInsertModal` - Modal for selecting note types and inserting flashcard blocks
- `FlashcardRenderer` - Renders valid flashcards with proper styling and markdown support
- `FlashcardProcessor` - Handles flashcard code block processing and error display
- `BlockFlashcardParser` - Parses YAML-formatted flashcard content with detailed error reporting
- `ObsidianAnkiSettingTab` - Settings interface for plugin configuration and note type cache
- `SampleModal` - Legacy modal component (should be removed in cleanup)
- Anki connection testing happens on plugin load via `YankiConnect.deck.deckNames()`

## Flashcard Format

The plugin uses YAML-formatted code blocks for flashcards:

```flashcard
note_type: Basic
front: Question content
back: Answer content
tags:
  - topic1
  - topic2
```

## Flashcard Rendering

The plugin now includes comprehensive flashcard rendering with:

- **Visual flashcard display** - Styled cards with note type headers, field content, and tags
- **Error handling** - Invalid flashcards show with red border and detailed error messages
- **Hover tooltips** - Error icons display specific parsing issues on hover
- **Markdown support** - Field content supports full Obsidian markdown rendering
- **Fallback display** - Invalid flashcards still show original YAML content for editing

## Current Limitations & TODOs

- Sync button only tests connection, doesn't perform actual sync
- No progress tracking for sync operations
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

1. Implement actual sync functionality (currently only tests connection)
2. Add sync progress modal with user confirmation
3. Add keyboard shortcuts for common actions
4. Implement flashcard rendering in reading mode
5. Add cloze deletion syntax support
