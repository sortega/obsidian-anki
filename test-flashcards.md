# Flashcard Rendering Test

## Basic Flashcard

```flashcard
NoteType: Basic
Front: What is the capital of France?
Back: Paris
Tags:
  - geography
  - europe
```

## Multi-line Content

```flashcard
NoteType: Basic
Front: |
  What is the **Pythagorean theorem**?
  
  Used in geometry for right triangles.
Back: |
  The formula is: `a² + b² = c²`
  
  Where:
  - a and b are the legs
  - c is the hypotenuse
Tags:
  - math
  - geometry
```

## Different Note Type

```flashcard
NoteType: Cloze
Text: The capital of {{c1::France}} is {{c2::Paris}}.
Tags:
  - geography
```

## Invalid Flashcard (should show error with red border)

```flashcard
invalid yaml format
missing colons
```

## Advanced YAML Features

```flashcard
NoteType: "Basic"
Front: |
  This is a multi-line question
  with **markdown** support
  - List item 1
  - List item 2
Back: >
  This is a folded string that will
  be joined into a single line with
  spaces between the lines.
Tags: ["math", "geometry", "advanced"]
```

## Edge Cases

```flashcard
# This should fail - no content fields
NoteType: Basic
Tags: [test]
```

## Invalid Tag Formats (should show errors)

```flashcard
NoteType: Basic
Front: Question
Back: Answer
Tags: "geography, europe"
```

```flashcard
NoteType: Basic
Front: Question
Back: Answer
Tags: geography, europe
```

## Minimal Flashcard

```flashcard
Front: Simple question
Back: Simple answer
```

## Cards with warnings

```flashcard
NoteType: UnknownType
Front: foo
Back: bar
```

```flashcard
NoteType: Basic
Front: My **front**
Unknown: My *unknown field*
```

## Cards with custom decks

```flashcard
NoteType: Basic
Deck: Math
Front: What is 2+2?
Back: 4
Tags:
  - arithmetic
```

```flashcard
NoteType: Basic
Deck: Science::Biology
Front: What is the powerhouse of the cell?
Back: Mitochondria
Tags:
  - biology
  - cellular
```

```flashcard
NoteType: Basic
Deck: Languages::Spanish
Front: How do you say "hello" in Spanish?
Back: Hola
Tags:
  - spanish
  - greetings
```

## Front-matter Metadata Examples

Here are examples showing how front-matter can be used to set default deck and tags for all flashcards in a file:

### Example 1: Front-matter with Default Deck

In a file with this front-matter:
```yaml
---
AnkiDeck: Math::Algebra
---
```

All flashcards without explicit `Deck:` field will use `Math::Algebra`:

```flashcard
NoteType: Basic
Front: What is the quadratic formula?
Back: x = (-b ± √(b²-4ac)) / 2a
Tags:
  - formulas
```

### Example 2: Front-matter with Default Tags

In a file with this front-matter:
```yaml
---
AnkiTags:
  - course-material
  - semester-1
---
```

All flashcards will include these tags in addition to their own:

```flashcard
NoteType: Basic
Front: What is integration?
Back: The reverse process of differentiation
Tags:
  - calculus
  - concepts
```

### Example 3: Front-matter with Both Deck and Tags

In a file with this front-matter:
```yaml
---
AnkiDeck: Science::Physics
AnkiTags:
  - physics-101
  - chapter-3
---
```

Multiple flashcards inherit the deck and tags:

```flashcard
NoteType: Basic
Front: What is Newton's first law?
Back: An object at rest stays at rest unless acted upon by a force
Tags:
  - newton
  - laws
```

```flashcard
NoteType: Basic
Front: What is the formula for kinetic energy?
Back: KE = ½mv²
Tags:
  - energy
  - formulas
```

### Example 4: Precedence - Flashcard Overrides Front-matter

With front-matter deck `Science::Physics`, this flashcard overrides it:

```flashcard
NoteType: Basic
Deck: Math::Geometry
Front: What is the area of a circle?
Back: A = πr²
Tags:
  - formulas
```

### Example 5: Tag Deduplication

With front-matter tags `[global, shared]`, duplicates are automatically removed:

```flashcard
NoteType: Basic
Front: Test question
Back: Test answer
Tags:
  - shared
  - local
  - global
```

## Cloze Deletion Examples

### Basic Cloze

```flashcard
NoteType: Cloze
Text: The capital of France is {{c1::Paris}} and it has approximately {{c2::2.2 million}} inhabitants.
Deck: Geography
Tags:
  - europe
  - capitals
```

### Cloze with Hints

```flashcard
NoteType: Cloze
Text: The {{c1::mitochondria::organelle}} is the {{c2::powerhouse::function}} of the {{c1::cell::basic unit}}.
Deck: Biology
Tags:
  - cell-biology
```

### Multiple Same Cloze Numbers

```flashcard
NoteType: Cloze
Text: Water freezes at {{c1::0°C}} and boils at {{c2::100°C}} under standard conditions.
Tags:
  - chemistry
  - physics
```

### Complex Content

```flashcard
NoteType: Cloze
Text: Einstein's famous equation is {{c1::E = mc²}} where {{c2::E represents energy}}, {{c3::m represents mass}}, and {{c4::c represents the speed of light}}.
Deck: Physics
Tags:
  - relativity
  - equations
```

### Nested Cloze Deletions

```flashcard
NoteType: Cloze
Text: The {{c1::capital of {{c2::France}} is {{c3::Paris}}}}.
Tags:
  - geography
  - nested
```

### Deeply Nested Cloze

```flashcard
NoteType: Cloze
Text: The {{c1::{{c2::best}} example of {{c3::nested {{c4::cloze}} deletions}}}}.
Tags:
  - examples
  - complex
```

### Cloze with Extra Field

```flashcard
NoteType: Cloze
Text: The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.
Extra: Remember that mitochondria have their own DNA and are thought to have evolved from bacteria that were engulfed by early eukaryotic cells.
Deck: Biology
Tags:
  - cell-biology
  - organelles
```

### Cloze with Warnings (Hover to see info)

```flashcard
NoteType: Cloze
Text: The {{c1::nucleus}} controls the cell and contains {{c2::DNA}}.
UnknownField: This will generate a warning
Deck: Advanced Biology
Tags:
  - cell-biology
  - genetics
```
