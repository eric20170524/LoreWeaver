# CommonLib Code Analysis Report

This document provides a comprehensive analysis of the reusable code library (`commonlib`) for Phaser 3 game development.

# File: `commonlib/main.js`

Entry point for the game. Initializes the Phaser game instance and registers scenes.

## Scenes
- `BootScene`: Handles preloading (progress bar).
- `MenuScene`: Main menu with title and start button.
- `PlayScene`: Core gameplay scene.
- `GameOverScene`: Game over screen with restart functionality.

---

# Scenes (`commonlib/scenes/`)

## File: `commonlib/scenes/AchievementScene.js`
### Class: **AchievementScene** (extends `Phaser.Scene`)
Displays a victory/achievement screen with confetti.

- **`create()`**: Sets up background, title, subtitle, and confetti.
- **`createButton(x, y, text, callback)`**: Creates an interactive button.
- **`createConfetti()`**: Generates particle effects.

## File: `commonlib/scenes/BootScene.js`
### Class: **BootScene** (extends `Phaser.Scene`)
Handles asset preloading and displays a progress bar.

- **`preload()`**: Draws a loading bar and listens for progress events.
- **`create()`**: Transitions to `MenuScene`.

## File: `commonlib/scenes/GameOverScene.js`
### Class: **GameOverScene** (extends `Phaser.Scene`)
Generic "Game Over" screen.

- **`create()`**: Displays "Game Over" text and a restart button.

## File: `commonlib/scenes/MenuScene.js`
### Class: **MenuScene** (extends `Phaser.Scene`)
Generic Start Menu.

- **`create()`**: Displays title, background stars, and a "Start Game" button.
- **`createButton(x, y, text, callback)`**: Helper to create animated buttons.

## File: `commonlib/scenes/PlayScene.js`
### Class: **PlayScene** (extends `Phaser.Scene`)
Generic template for gameplay. Demonstrates integration of systems.

- **`create()`**: Sets up draggable objects, particle systems, and voice manager interactions.

---

# Systems (`commonlib/systems/`)

## File: `commonlib/systems/GameBridge.js`
### Class: **GameBridge**
Handles communication with the parent platform (X Learn Lab) via `postMessage`.

- **`static notifyLoaded()`**: Signals game is ready.
- **`static notifyWin(score)`**: Reports victory and score.
- **`static notifyFail(score)`**: Reports failure.
- **`static reportMistake(questionText, wrongAns, correctAns)`**: Logs incorrect answers for AI analysis.
- **`static reportError(message, code)`**: Logs runtime errors.

## File: `commonlib/systems/NPCManager.js`
### Class: **NPCManager**
Manages Non-Player Characters (NPCs).

- **`createNPC(x, y, name, hasQuestion)`**: Creates a visual NPC container with optional question mark.
- **`removeQuestionMark(npc)`**: Hides the question indicator.
- **`clearAll()`**: Destroys all NPCs.

## File: `commonlib/systems/ParticleSystem.js`
### Class: **ParticleSystem**
Manages visual particle effects.

- **`createSuccessParticles(x, y)`**: Spawns simple success particles.
- **`createCelebrationParticles(x, y)`**: Spawns larger celebration confetti.

## File: `commonlib/systems/QuestionSystem.js`
### Class: **QuestionSystem**
Manages quiz data and progression.

- **`generateQuestions()`**: Placeholder for question generation logic.
- **`getCurrentQuestion()`**: Returns the current question object.
- **`nextQuestion()`**: Advances to the next question.
- **`getProgress()`**: Returns current progress stats (current, total, percentage).
- **`reset()`**: Resets the question index.

## File: `commonlib/systems/VoiceManager.js`
### Class: **VoiceManager**
Unified audio system for Sound Effects (SFX) and Text-to-Speech (TTS).

- **`init()`**: Initializes AudioContext and speech synthesis voices.
- **`setMute(muted)`**: Toggles audio.
- **`playTone(freq, type, duration, vol)`**: Generates a synthetic tone.
- **`speak(text)`**: Uses `SpeechSynthesis` to speak text.
- **`playClick()`**: Plays a UI click sound.
- **`playDrag()`**: Plays a soft drag sound.
- **`playCorrect()`**: Plays a success chime.
- **`playWrong()`**: Plays an error buzzer.
- **`playComplete()`**: Plays a victory melody.

---

# Utilities (`commonlib/utils/`)

## File: `commonlib/utils/AnimalFactory.js`
### Class: **AnimalFactory**
Generates vector graphics for animals.

- **`createAnimal(type, x, y)`**: Creates an animal container (rabbit, bird, squirrel).
- **`drawRabbit(container)`**, **`drawBird(container)`**, **`drawSquirrel(container)`**: Internal drawing logic.

## File: `commonlib/utils/Colors.js`
### Class: **Colors**
Static color palette constants (e.g., `SKY`, `GRASS`, `BUTTON_GREEN`).

## File: `commonlib/utils/DragHelper.js`
### Class: **DragHelper**
Simplifies drag-and-drop interactions.

- **`static setupDraggable(scene, gameObject, onDragStart, onDragEnd)`**: Enables dragging with visual feedback.
- **`static returnToStart(gameObject, scene)`**: Animates object back to original position.
- **`static snapToTarget(gameObject, targetX, targetY, scene, onComplete)`**: Snaps object to a specific location.

## File: `commonlib/utils/DrawingUtil.js`
### Class: **DrawingUtil**
General canvas drawing helpers.

- **`static drawStars(scene)`**: Fills the background with random stars.

## File: `commonlib/utils/Geometry.js`
### Class: **Geometry**
Helper for drawing complex geometric shapes.

- **`static drawStar(...)`**: Draws a star shape.
- **`static drawBasket(...)`**: Draws a basket.
- **`static drawJar(...)`**: Draws a jar.
- **`static drawGlow(...)`**: Draws a radial glow effect.

## File: `commonlib/utils/GraphicsGen.js`
### Class: **GraphicsGen**
Generates textures for game assets.

- **`createBear(scene, key)`**: Generates bear texture.
- **`createFriend(scene, key)`**: Generates rabbit friend texture.
- **`createTree(scene, key)`**: Generates tree texture.
- **`createHouse(scene, key)`**: Generates house texture.
- **`createRock(scene, key)`**: Generates rock texture.
- **`createFlower(scene, key)`**: Generates flower texture.
- **`createDirectionButton(scene, direction, key)`**: Generates arrow buttons.

## File: `commonlib/utils/Random.js`
### Class: **RandomUtil**
Random number utilities.

- **`static randomInt(min, max)`**: Returns random integer.
- **`static randomFloat(min, max)`**: Returns random float.
- **`static choice(array)`**: Returns random array element.
- **`static shuffle(array)`**: Shuffles an array.
- **`static chance(probability)`**: Returns boolean based on probability.