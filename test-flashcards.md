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
