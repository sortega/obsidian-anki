# Flashcard Rendering Test

## Basic Flashcard

```flashcard
note_type: Basic
Front: What is the capital of France?
Back: Paris
tags:
  - geography
  - europe
```

## Multi-line Content

```flashcard
note_type: Basic
Front: |
  What is the **Pythagorean theorem**?
  
  Used in geometry for right triangles.
Back: |
  The formula is: `a² + b² = c²`
  
  Where:
  - a and b are the legs
  - c is the hypotenuse
tags:
  - math
  - geometry
```

## Different Note Type

```flashcard
note_type: Cloze
Text: The capital of {{c1::France}} is {{c2::Paris}}.
tags:
  - geography
```

## Invalid Flashcard (should show error with red border)

```flashcard
invalid yaml format
missing colons
```

## Advanced YAML Features

```flashcard
note_type: "Basic"
Front: |
  This is a multi-line question
  with **markdown** support
  - List item 1
  - List item 2
Back: >
  This is a folded string that will
  be joined into a single line with
  spaces between the lines.
tags: ["math", "geometry", "advanced"]
```

## Edge Cases

```flashcard
# This should fail - no content fields
note_type: Basic
tags: [test]
```

## Invalid Tag Formats (should show errors)

```flashcard
note_type: Basic
Front: Question
Back: Answer
tags: "geography, europe"
```

```flashcard
note_type: Basic
Front: Question
Back: Answer
tags: geography, europe
```

## Minimal Flashcard

```flashcard
Front: Simple question
Back: Simple answer
```
