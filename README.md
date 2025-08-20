# Wordle — No-Backend Clone

A lightweight Wordle clone built with plain HTML, CSS, and JavaScript.

## Features
- Uses pre-built answer and allowed word lists with no server component.
- Mobile-first design with an on-screen keyboard.
- Optional Hard Mode that locks in after the first guess.
- Start a new game at any time.

## Getting Started
Simply open `index.html` in a modern web browser to play.

Word lists are bundled in `words.js`, generated from uploaded word files.

## License
This project is open source under the MIT License.

## Debugging
To reveal the current target word during testing, open the browser's developer console and assign any value to the global `REVEAL_ANSWER` variable:

```js
REVEAL_ANSWER = true; // logs the secret word to the console
```
