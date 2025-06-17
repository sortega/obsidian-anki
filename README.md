# Obsidian Anki plugin

This is an Obsidian plugin called "Obsidian Anki" that syncs Obsidian notes to Anki flashcards. 
The plugin integrates with Anki via the yanki-connect library to provide bi-directional syncing.

## Embedding flashcards in Markdown files

When you sync your Obsidian vault with Anki, the plugin scans your Markdown files searching for flashcards in the
following patterns.

Flashcards use a YAML format inside a `flashcard` code block with the following fields:

- `deck` (optional): deck to sync the card to. Default value is `Default`.
- `note_type` (optional): which note type to use in Anki. Default value is `Basic`.
- `tags` (optional): tags to add to the flashcard. Default value is the empty string.
- content fields: these depend on the note type and support full Markdown content including images, formatting, 
  lists, and code blocks. The `|` (pipe) character allows multi-line content with preserved formatting.

### Basic note

- `note_type`: `Basic`
- `front`: the text in the front of the card
- `back`: the back of it

#### Simple format
```flashcard
front: What is the capital of France?
back: Paris
```

#### Multi-line format with Markdown
```flashcard
front: |
  What is the **Pythagorean theorem**?
  
  ![triangle](triangle.png)
back: |
  The formula is: `a² + b² = c²`
  
  Where:
  - a and b are the legs
  - c is the hypotenuse
```
