# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin called "Obsidian Anki" that syncs Obsidian notes to Anki flashcards. The plugin integrates with Anki via the `yanki-connect` library and provides:

- Ribbon icon for manual sync to Anki
- Status bar indicator showing Anki connection status
- Plugin settings tab for configuration
- Commands accessible via Command Palette

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
- `SampleModal` - Modal dialog component (currently placeholder)
- `ObsidianAnkiSettingTab` - Settings interface for plugin configuration
- Anki connection testing happens on plugin load via `YankiConnect.deck.deckNames()`

## Development Notes

- The plugin requires Anki to be running with AnkiConnect addon for proper functionality
- TypeScript compilation uses strict null checks and targets ES6
- Plugin manifest shows it's compatible with Obsidian 0.15.0+
- Development build includes inline source maps for debugging