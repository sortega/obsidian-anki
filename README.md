# Obsidian Anki Plugin

Sync your Obsidian notes to Anki flashcards seamlessly. This plugin allows you to create flashcards directly in your markdown files and synchronize them with your Anki collection.

## Features

### Current
- 📝 **Insert Flashcards**: Create flashcards using a simple code block syntax
- 🔗 **Anki Integration**: Connect to Anki via AnkiConnect addon (desktop)
- 🎨 **Visual Rendering**: Beautiful flashcard display in reading mode
- ⚙️ **Settings Management**: Configure note types and manage cached data
- 🎯 **Note Type Selection**: Choose from available Anki note types
- 🔄 **Full Sync**: Complete vault scanning and bidirectional sync with Anki (desktop)
- 🔗 **Obsidian Backlinks**: Automatic backlinks from Anki cards to Obsidian notes
- ⌨️ **Command Palette & Hotkeys**: Access functions via command palette or hotkeys
- 🖼️ **Media Sync**: Automatic syncing of images and audio files (desktop)
- 🧠 **Cloze Deletion**: Complete support for cloze deletion cards with color-coded highlighting
- 📱 **Mobile Support**: Full flashcard rendering and creation on mobile using cached note types

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

### Access Methods

There are multiple ways to access the plugin's functionality:

1. **Command Palette**: Press `Cmd/Ctrl+Shift+P` and search for:
   - "Anki: Sync to Anki" 
   - "Anki: Insert flashcard"

2. **Hotkeys**: Use the default shortcuts (customizable in Settings → Hotkeys):
   - `Cmd+Ctrl+A` - Sync to Anki
   - `Cmd+Ctrl+F` - Insert flashcard

3. **Ribbon Icons**: Click the icons in the left sidebar

### Creating Flashcards

Use any of the above methods to insert flashcard blocks, or create them manually:

```flashcard
NoteType: Basic
Deck: Geography
Front: What is the capital of France?
Back: Paris
Tags:
  - geography
  - europe
```

**Important**: Tags must be formatted as a YAML list using the dash syntax shown above. String formats like `Tags: "geography, europe"` are not supported.

### Deck Management

Flashcards can be assigned to specific Anki decks:

```flashcard
NoteType: Basic
Deck: Math::Algebra
Front: What is x if 2x + 3 = 7?
Back: x = 2
Tags:
  - algebra
```

- **Deck field**: Optional field that specifies which Anki deck the card should be placed in
- **Hierarchical decks**: Supports nested decks using `::` notation (e.g., `Math::Algebra::Linear`)
- **Default deck**: Cards without a Deck field use the default deck from plugin settings
- **Automatic moves**: Cards are automatically moved to the correct deck during sync

### Front-matter Global Settings

You can set default deck and tags for all flashcards in a file using YAML front-matter:

```yaml
---
AnkiDeck: Science::Physics
AnkiTags:
  - physics-101
  - semester-1
---
```

```flashcard
NoteType: Basic
Front: What is Newton's first law?
Back: An object at rest stays at rest unless acted upon by a force
Tags:
  - newton
  - laws
```

**Precedence Rules**:
- **Deck**: Flashcard `Deck:` field > Front-matter `AnkiDeck` > Plugin default
- **Tags**: Front-matter `AnkiTags` are merged with flashcard `Tags:` (duplicates removed automatically)

**Example**: The above flashcard will be placed in `Science::Physics` deck and tagged with `physics-101`, `semester-1`, `newton`, `laws`.

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
- **Cloze**: Text, Extra. This note type is rendered as a paragraph with highlights. ![](media/cloze-deletion.png)
- **Custom note types**: Any fields you've defined

### Syncing to Anki
Click the sync button in the ribbon to synchronize your flashcards with Anki. The plugin will:
1. Scan your vault for flashcard blocks
2. Compare with existing Anki cards
3. Show you what changes will be made
4. Apply changes after confirmation
5. Update Obsidian files with new Anki IDs

Images in your notes are synchronized with the following limitations:

- Only local media, no external links nor `data:` links
- Only images
- Only Markdown (`![alt](path/to/image)`) or HTML images are synced. The Obsidian image syntax (`![[image]]`) is not supported

### Obsidian Backlinks

The plugin doesn't automatically create backlinks from Anki to Obsidian. However, you can modify you note
templates to show backlinks.

Add this to your card template (repeat for all card types of all notes you need backlinks on). You most
likely want this in your back template.

```html
<div id="note-id" style="display: none;">
	[<a href="#">📝 From Obsidian</a>]
</div>

<script>
	(() => {
	  const container = document.getElementById('note-id');
	  if (!container) return;
  
	  const tags = '{{text:Tags}}'.split(' ');
	  const vaultTag = tags.find(t => t.startsWith('obsidian-vault::'));
	  const fileTag = tags.find(t => t.startsWith('obsidian-file::'));
  
	  if (!tags.includes('obsidian-synced') || !vaultTag) return;
  
	  const vault = vaultTag.slice(16); // Remove 'obsidian-vault::'
	  const file = fileTag?.slice(15); // Remove 'obsidian-file::'
  
	  const link = container.querySelector('a');
	  if (file) {
		link.href = `obsidian://open?vault=${vault}&file=${file}`;
		link.textContent = '📝 ' + decodeURI(file).replace(/\.md$/, '');
	  } else {
		link.href = `obsidian://open?vault=${vault}`;
	  }
  
	  container.style.display = 'block';
	})();
</script>
```

Add to this to your note styles:

```css
#note-id {
    font-size: 70%;
    margin-top: 1ex;
    text-align: right;
    color: grey;
}

#note-id a {
    color: grey;
}
```

Of course, you can experiment with other styles and evolve this snippets to fit your use case.

## Mobile Support

The plugin works seamlessly on mobile devices (iOS and Android) with the following capabilities:

### What Works on Mobile
- ✅ **Full flashcard rendering** - All flashcard types display correctly
- ✅ **Flashcard creation** - Insert new flashcards using cached note types
- ✅ **Cloze deletion support** - Complete color-coded cloze highlighting
- ✅ **Edit flashcards** - Tap the edit icon to navigate to source and modify flashcards
- ✅ **Visual styling** - All CSS styling and themes work

### Mobile Limitations
- ❌ **No syncing** - AnkiConnect cannot run on mobile devices
- ⚠️ **Cached note types only** - Uses note types saved from last desktop sync

### Getting Started on Mobile
1. First, sync your vault from desktop to cache note types
2. On mobile, use the "Insert Flashcard" button to create cards
3. Your mobile-created flashcards will sync when you return to desktop

## Configuration

Access plugin settings through Settings → Plugin Options → Obsidian Anki:
- **Default Deck**: Choose where new flashcards will be created in Anki
- **Ignored Tags**: Configure tags to ignore during sync (default: marked, leech)
- **Note Type Cache**: View cached note types from your last Anki connection and reset if needed

On mobile, settings show a mobile mode indicator with explanatory text.

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
