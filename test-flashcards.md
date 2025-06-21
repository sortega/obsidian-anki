# Flashcard Rendering Test

## Basic Flashcard

```flashcard
note_type: Basic
front: What is the capital of France?
back: Paris
tags:
  - geography
  - europe
```

## Multi-line Content

```flashcard
note_type: Basic
front: |
  What is the **Pythagorean theorem**?
  
  Used in geometry for right triangles.
back: |
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
text: The capital of {c1::France} is {c2::Paris}.
tags:
  - geography
```

## Invalid Flashcard (should show as code block)

```flashcard
invalid yaml format
missing colons
```

## Minimal Flashcard

```flashcard
front: Simple question
back: Simple answer
```