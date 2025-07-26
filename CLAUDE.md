# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin called "Obsidian Anki" that syncs Obsidian notes to Anki flashcards. The plugin integrates with Anki via the `yanki-connect` library and provides:

- Ribbon icon for manual sync to Anki (currently connects but doesn't sync)
- Ribbon icon for inserting flashcards with note type selection
- Command palette integration with hotkeys
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
- **Domain layer**: Clear separation between `Flashcard` (markdown content) and `HtmlFlashcard` (rendered HTML) types
- **Type Safety**: `AnkiNote` interface uses `htmlFields` for consistent HTML content handling
- **HTML Field Architecture**: `HtmlFlashcard.htmlFields` uses `Record<string, Document>` for reduced parsing overhead and better DOM manipulation
- **Content Rendering**: `MarkdownService` handles markdown-to-HTML conversion with `toHtmlFlashcard()` method returning Document objects
- **Media Integration**: Seamless integration of media files with content-based deduplication and safe filename handling
- **Build system**: esbuild configuration in `esbuild.config.mjs` bundles TypeScript to `main.js`

## Key Components

- `ObsidianAnkiPlugin` - Main plugin class that handles initialization, commands, and Anki connection
- `AnkiService` - Interface (port) defining Anki operations needed by the application
- `YankiConnectAnkiService` - Adapter implementing AnkiService using yanki-connect library
- `FlashcardInsertModal` - Modal for selecting note types and inserting flashcard blocks
- `FlashcardRenderer` - Renders `HtmlFlashcard` objects with proper styling (accepts pre-rendered HTML content)
- `MarkdownService` - Handles markdown-to-HTML conversion and provides `toHtmlFlashcard()` conversion method
- `FlashcardCodeBlockProcessor` - Instance-based processor with dependency injection for App access (non-static)
- `BlockFlashcardParser` - Parses YAML-formatted flashcard content with modular `parseDeck()` and `parseTags()` methods
- `ObsidianAnkiSettingTab` - Settings interface for plugin configuration and note type cache
- `SyncProgressModal` - Modal for vault scanning and sync progress tracking
- `SyncConfirmationModal` - Modal for reviewing and confirming sync changes
- `FlashcardDiffRenderer` - Renders compact diff views for changed flashcards with structured change detection
- `HtmlFlashcardDiffer` - Analyzes differences between HTML flashcards and provides structured diff data
- `SampleModal` - Legacy modal component (should be removed in cleanup)
- `ClozeHighlighter` - Recursive cloze deletion parsing with balanced brace counting and hint support
- `NavigationUtils` - Centralized navigation utility for file and line navigation

## Flashcard Format

The plugin uses YAML-formatted code blocks for flashcards:

```flashcard
NoteType: Basic
Deck: Math::Algebra
Front: Question content
Back: Answer content
Tags:
  - topic1
  - topic2
```

**Important**: Tags must be formatted as a YAML list using the dash syntax. String formats like `Tags: "topic1, topic2"` are not supported and will cause parsing errors.

## Cloze Deletion Support

The plugin provides comprehensive support for Anki's Cloze note type with special rendering and advanced features:

### Cloze Syntax
- **Basic**: `{{c1::answer}}` - Simple cloze deletion
- **With Hints**: `{{c1::answer::hint}}` - Cloze with hint text (hint not displayed in preview)
- **Nested**: `{{c1::outer {{c2::inner}} content}}` - Recursive nested cloze deletions
- **Multiple**: `{{c1::first}} and {{c1::second}}` - Multiple deletions with same number

### Special Rendering
- **Paragraph-like**: Cloze cards render without headers/borders for natural reading flow
- **Color-coded**: Each cloze number gets a distinct color (cloze-1 through cloze-10, cycling)
- **Hover Effects**: Visual feedback when hovering over cloze deletions
- **Extra Field**: Automatically rendered as a separate paragraph with muted styling

### Technical Implementation
- **Recursive Parsing**: `ClozeHighlighter.highlightClozes()` handles arbitrary nesting with balanced brace counting
- **Hint Processing**: Correctly strips `::hint` suffixes while preserving nested content
- **CSS Classes**: `.cloze-deletion .cloze-N` with transparency for light/dark themes
- **Hover Popups**: Display warnings, tags, deck, and sync status on hover

## Front-matter Processing

The plugin supports YAML front-matter to set default properties for all flashcards in a file:

```yaml
---
AnkiDeck: Math::Algebra
AnkiTags:
  - course-material
  - semester-1
---
```

### Property Precedence

- **Deck Selection**: `Deck:` field > `AnkiDeck` front-matter > plugin default
- **Tag Merging**: Front-matter `AnkiTags` are combined with flashcard `Tags:` (duplicates automatically removed)

### Implementation Details

- **NoteMetadata Interface**: Defined in `flashcard.ts` with `AnkiDeck?` and `AnkiTags?` properties
- **Property Constants**: `ANKI_DECK_PROPERTY` and `ANKI_TAGS_PROPERTY` in `constants.ts`
- **Front-matter Extraction**: Both sync analysis and live preview extract metadata from file cache
- **Type Safety**: Uses `FrontMatterCache` type instead of `any` for better type checking

## Deck Management

The plugin supports comprehensive deck management:

- **Deck Field**: Optional `Deck` field specifies target Anki deck
- **Hierarchical Support**: Nested decks using `::` notation (e.g., `Languages::Spanish::Verbs`)
- **Default Fallback**: Cards without Deck field use plugin's default deck setting
- **Automatic Movement**: Cards are moved to correct deck during sync without losing review history
- **Visual Feedback**: Deck name displayed in flashcard UI when different from default
- **Multi-deck Notes**: Handles notes with cards in different decks during sync

## Settings Interface

The plugin provides an improved settings interface with:

- **Reordered Settings**: Ignored tags configuration moved to second position for better prominence
- **Enhanced UI**: Wider, non-resizable text area for ignored tags with CSS-based styling
- **Tag Filtering**: Configure tags to ignore during sync (default: `marked`, `leech`)
- **Note Type Cache**: View and manage cached Anki note types from last successful connection

## Tag Filtering

The plugin supports ignoring specific tags during sync operations to avoid unnecessary changes:

- **Ignored Tags**: Configure tags to ignore during sync in plugin settings (default: `marked`, `leech`)
- **Automatic Filtering**: These tags are filtered out when converting Anki notes to flashcards and during tag comparison
- **No False Changes**: Cards won't be marked as "changed" just because of ignored tag differences
- **Import Support**: Ignored tags are also filtered when importing orphaned Anki cards back to Obsidian

## Flashcard Rendering

The plugin includes comprehensive flashcard rendering with improved type safety:

- **Type-Safe Rendering** - `FlashcardRenderer` accepts `HtmlFlashcard` objects with pre-rendered HTML content
- **Separation of Concerns** - `Flashcard` contains markdown content, `HtmlFlashcard` contains HTML content
- **Visual flashcard display** - Styled cards with note type headers, field content, and tags
- **Error handling** - Invalid flashcards show with red border and detailed error messages
- **Hover tooltips** - Error icons display specific parsing issues on hover
- **Markdown support** - Content converted from markdown to HTML via `MarkdownService.toHtmlFlashcard()`
- **Fallback display** - Invalid flashcards still show original YAML content for editing
- **Robust YAML parsing** - Uses js-yaml library for proper YAML syntax support
- **Advanced YAML features** - Supports multiline strings (|, >), arrays, quoted strings, and complex structures

### Obsidian Backlinks

The plugin doesn't automatically create backlinks from Anki to Obsidian. Instead, it adds special tags to synced cards that can be used to create links back to your Obsidian notes in Anki card templates.

## Media File Synchronization

The plugin includes comprehensive media file synchronization capabilities:

- **Automatic Media Discovery** - Scans flashcard HTML content for relative image paths
- **Content-Based Deduplication** - Uses MD5 hashing to avoid syncing duplicate files
- **Safe Filename Mangling** - Uses base64 encoding for vault paths: `obsidian-synced-${base64EncodedPath}-${contentMd5Hash}.${extension}`
- **Bidirectional Transformation** - Converts vault paths to Anki filenames during sync and back for display
- **Progress Tracking** - Shows detailed media sync progress in the sync execution modal
- **Error Handling** - Graceful handling of media sync failures with detailed error reporting

### Media Sync Process
1. Extract image references from flashcard HTML content
2. Load image files as `MediaItem` objects with Uint8Array contents
3. Generate mangled Anki filenames with base64-encoded paths and MD5 content hashes
4. Check if media already exists in Anki using content comparison
5. Upload new/changed media files to Anki collection
6. Transform HTML content to use Anki media filenames
7. Reverse transformation for display purposes

## Structured Diff Rendering

The plugin provides advanced diff rendering for changed flashcards using a structured approach:

- **Compact Change Detection** - Uses `HtmlFlashcardDiffer` to analyze specific differences (deck, tags, fields, note type, source path)
- **Word-Level Field Diffing** - Employs the `diff` library for precise HTML content comparison at word boundaries
- **Progressive Disclosure** - Shows compact summaries with expandable full preview for detailed examination
- **Performance Optimization** - Pre-computes HTML conversions and diffs during analysis to avoid redundant work during rendering
- **Structured Data** - Uses `ChangedFlashcard` interface to bundle all necessary data (flashcard, AnkiNote, HTML versions, and diff results)

### Diff Architecture
- **`HtmlFlashcardDiffer`** - Core diffing engine that returns `FlashcardDiff` objects with optional properties for each change type
- **`FlashcardDiffRenderer`** - Renders compact diff views using pre-computed data to eliminate duplicate conversions
- **`ChangedFlashcard` Interface** - Bundles flashcard data, AnkiNote, HTML versions, and diff results for efficient rendering
- **Progressive Loading** - Full previews are lazy-loaded only when user expands the details section

## Mobile Support

The plugin fully supports mobile platforms (iOS and Android) with a subset of functionality:

### Mobile Features
- **Full flashcard rendering** - All flashcard types (Basic, Cloze, etc.) render correctly
- **Flashcard creation** - Insert flashcard modal works with cached note types from desktop
- **Cloze deletion support** - Complete cloze highlighting and rendering on mobile
- **Edit flashcards** - Navigate to flashcard source by tapping the edit icon (always visible on mobile)

### Mobile Limitations
- **No syncing** - AnkiConnect cannot run on mobile devices
- **Cached note types only** - Uses note types cached from last desktop sync

### Mobile-Specific UI
- **Mobile mode indicator** - Settings tab shows mobile status with helpful instructions
- **Graceful degradation** - Sync features are cleanly disabled without errors
- **Helpful notices** - Clear messaging when cached note types are unavailable

## Development Notes

- The plugin requires Anki to be running with AnkiConnect addon for proper functionality (desktop only)
- TypeScript compilation uses strict null checks and targets ES6
- Plugin manifest shows it's compatible with Obsidian 0.15.0+ and mobile platforms
- Development build includes inline source maps for debugging
- Development plan and roadmap available at PLAN.md
- Settings store note types from last successful Anki connection for offline use
- Button states update based on active editor and available note types
- Platform detection using `Platform.isMobileApp` for conditional feature loading
- Mobile edit icon always visible for easy flashcard editing

## Testing

The plugin includes comprehensive test coverage with Jest:

- **Core Functionality Tests** - Flashcard parsing, note metadata, and Anki service operations
- **Media Pipeline Tests** - Media transformation, extraction, and sync functionality with base64 encoding validation
- **Renderer Tests** - Flashcard rendering with proper mocking and image source resolution
- **Cloze Highlighting Tests** - Recursive cloze deletion parsing with nested patterns and hint handling
- **DOM Manipulation Tests** - Verification that DOM operations preserve encoding correctly
- **Shared Test Helpers** - Reusable test utilities in `tests/test-helpers.ts` for consistent testing

### Running Tests
- `npm test` - Run all tests
- `npm run test:coverage` - Run tests with coverage reporting
- Ensure Anki is running with AnkiConnect addon before testing integration features
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
- Use CSS classes instead of inline styles for UI components
- Maintain type safety with separate `Flashcard` (markdown) and `HtmlFlashcard` (HTML) interfaces
- Place content conversion logic in `MarkdownService` for consistency
