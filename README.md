# Obsidian Anki Plugin

Sync your Obsidian notes to Anki flashcards seamlessly. This plugin allows you to create flashcards directly in your markdown files and synchronize them with your Anki collection.

## Features

### Current
- 📝 **Insert Flashcards**: Create flashcards using a simple code block syntax
- 🔗 **Anki Integration**: Connect to Anki via AnkiConnect addon
- 🎨 **Visual Rendering**: Beautiful flashcard display in reading mode
- ⚙️ **Settings Management**: Configure note types and manage cached data
- 🎯 **Note Type Selection**: Choose from available Anki note types
- 🔄 **Full Sync**: Complete vault scanning and bidirectional sync with Anki
- 🔗 **Obsidian Backlinks**: Automatic backlinks from Anki cards to Obsidian notes

### Coming Soon
- ⌨️ **Keyboard Shortcuts**: Quick access to all plugin functions
- 🧠 **Cloze Deletion**: Specialized syntax for cloze deletion cards
- 🖼️ **Media Sync**: Automatic syncing of images and audio files

## Installation

### Prerequisites
1. Install [Anki](https://apps.ankiweb.net/) on your computer
2. Install the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) addon in Anki
3. Restart Anki to activate AnkiConnect

### Plugin Installation
1. Download the plugin files from the latest release
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-anki/` folder
3. Enable the plugin in Obsidian Settings → Community Plugins

## Usage

### Creating Flashcards

Use the flashcard insertion button in the ribbon or create flashcard blocks manually:

```flashcard
NoteType: Basic
Front: What is the capital of France?
Back: Paris
Tags:
  - geography
  - europe
```

**Important**: Tags must be formatted as a YAML list using the dash syntax shown above. String formats like `Tags: "geography, europe"` are not supported.

### Advanced Flashcard Formatting

The plugin supports rich markdown content within flashcards:

#### Multi-line format with Markdown
```flashcard
NoteType: Basic
Front: |
  What is the **Pythagorean theorem**?
  
  ![triangle](triangle.png)
Back: |
  The formula is: `a² + b² = c²`
  
  Where:
  - a and b are the legs
  - c is the hypotenuse
Tags:
  - math
  - geometry
```

### Supported Note Types
The plugin automatically detects your Anki note types and their fields. Common formats include:
- **Basic**: Front, Back
- **Basic (and reversed card)**: Front, Back
- **Cloze**: Text
- **Custom note types**: Any fields you've defined

### Syncing to Anki
Click the sync button in the ribbon to synchronize your flashcards with Anki. The plugin will:
1. Scan your vault for flashcard blocks
2. Compare with existing Anki cards
3. Show you what changes will be made
4. Apply changes after confirmation
5. Update Obsidian files with new Anki IDs

### Obsidian Backlinks

The plugin doesn't automatically create backlinks from Anki to Obsidian. Instead, it provides a way to link back to 
your Obsidian notes:
1. **Add special fields**: Include `ObsidianVault` and `ObsidianNote` fields in your Anki note types
2. **Auto-population**: Fields are automatically filled during sync with vault name and file path
3. **Create links**: Add `obsidian://open?vault={{ObsidianVault}}&file={{ObsidianNote}}` to your Anki card templates
4. **Click to open**: Click the link in Anki to jump directly to the source note in Obsidian

## Configuration

Access plugin settings through Settings → Plugin Options → Obsidian Anki:
- View cached note types from your last Anki connection
- Reset note type cache if needed
- Configure ignored tags (default: marked, leech) to exclude during sync

## Development

This plugin is built with TypeScript and uses the Obsidian Plugin API.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/your-username/obsidian-anki.git
cd obsidian-anki

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Testing
```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

See [TESTING.md](TESTING.md) for detailed testing information.

### Project Structure
- `main.ts` - Main plugin entry point
- `flashcard-insert-modal.ts` - Modal for inserting flashcards
- `plan.md` - Development roadmap and feature planning

## Contributing

Contributions are welcome! Please see the [development plan](plan.md) for current priorities and roadmap.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

TBD

## Support

- 🐛 Report bugs or request features via GitHub Issues
- 📚 Check the [development plan](plan.md) for upcoming features

## Acknowledgments

- Built with the [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- Uses [yanki-connect](https://www.npmjs.com/package/yanki-connect) for Anki integration
- Inspired by other Anki plugins in the Obsidian community
